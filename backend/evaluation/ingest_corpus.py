"""
Ingest a corpus through the real ingestion pipeline, stage by stage, with timings.

This does not go through HTTP. It calls the same parser, cleaner, chunker,
embedding service and vector store that POST /upload calls, so the timings
describe the actual pipeline rather than a reimplementation of it -- but it
calls each stage separately so each one can be timed on its own.

Documents are ingested under a synthetic user whose id encodes the chunking
configuration. Retrieval already filters by Document.user_id, so two
configurations can coexist in one database without interfering, and the
isolation being relied on is the production isolation.

Usage:
    python evaluation/ingest_corpus.py --corpus ../corpus
    python evaluation/ingest_corpus.py --corpus ../corpus --chunk-size 400 --chunk-overlap 60
    python evaluation/ingest_corpus.py --corpus ../corpus --reset
"""

from __future__ import annotations

import argparse
import asyncio
import os
import time
from pathlib import Path

from _common import config_id, eval_database_url, save

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.database.models import Document, DocumentChunk, ProcessingStatus, User
from app.ingestion.chunker import chunk_pages
from app.ingestion.cleaner import clean_pages
from app.ingestion.embeddings import get_embedding_service
from app.ingestion.parser import parse_document
from app.ingestion.supported_formats import SUPPORTED_EXTENSIONS
from app.ingestion.vector_store import store_chunks


def rss_mb() -> float | None:
    try:
        import psutil
    except ImportError:
        return None
    return round(psutil.Process(os.getpid()).memory_info().rss / 1024**2, 1)


async def ensure_user(db: AsyncSession, user_id: str) -> None:
    if await db.scalar(select(User).where(User.id == user_id)):
        return
    db.add(
        User(
            id=user_id,
            name="evaluation harness",
            email=f"{user_id}@evaluation.invalid",
            # Not a login account. The hash is a constant placeholder that no
            # password verifies against; the row exists only to satisfy the
            # documents.user_id foreign key.
            password_hash="pbkdf2_sha256$310000$evaluation$evaluation",
        )
    )
    await db.commit()


async def reset_config(db: AsyncSession, user_id: str) -> int:
    """Delete every document previously ingested under this configuration."""
    doc_ids = list(await db.scalars(select(Document.id).where(Document.user_id == user_id)))
    if doc_ids:
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id.in_(doc_ids)))
        await db.execute(delete(Document).where(Document.id.in_(doc_ids)))
        await db.commit()
    return len(doc_ids)


async def ingest_one(path: Path, user_id: str, db: AsyncSession, embedder) -> dict:
    """Run one document through every stage, timing each stage separately."""
    size_bytes = path.stat().st_size

    doc = Document(
        user_id=user_id,
        filename=path.name,
        original_filename=path.name,
        file_type=path.suffix.lstrip(".").lower(),
        file_size=size_bytes,
        storage_path=str(path),
        status=ProcessingStatus.processing,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    record: dict = {
        "document_id": doc.id,
        "filename": path.name,
        "file_type": doc.file_type,
        "file_size_bytes": size_bytes,
    }

    try:
        t = time.perf_counter()
        pages = parse_document(str(path))
        record["parse_ms"] = round((time.perf_counter() - t) * 1000, 2)

        t = time.perf_counter()
        pages = clean_pages(pages)
        record["clean_ms"] = round((time.perf_counter() - t) * 1000, 2)

        record["pages"] = len(pages)
        record["chars"] = sum(len(p.text) for p in pages)

        t = time.perf_counter()
        chunks = chunk_pages(pages, document_id=doc.id, filename=path.name)
        record["chunk_ms"] = round((time.perf_counter() - t) * 1000, 2)
        record["chunks"] = len(chunks)
        record["chunk_chars_mean"] = (
            round(sum(len(c.text) for c in chunks) / len(chunks), 1) if chunks else 0
        )

        if not chunks:
            raise ValueError("chunking produced 0 chunks")

        rss_before = rss_mb()
        t = time.perf_counter()
        embeddings = embedder.embed([c.text for c in chunks])
        record["embed_ms"] = round((time.perf_counter() - t) * 1000, 2)
        record["embedding_dim"] = len(embeddings[0])
        record["rss_before_embed_mb"] = rss_before
        record["rss_after_embed_mb"] = rss_mb()

        t = time.perf_counter()
        await store_chunks(chunks, embeddings, db)
        doc.status = ProcessingStatus.indexed
        doc.total_chunks = len(chunks)
        await db.commit()
        record["store_ms"] = round((time.perf_counter() - t) * 1000, 2)

        record["total_ms"] = round(
            record["parse_ms"]
            + record["clean_ms"]
            + record["chunk_ms"]
            + record["embed_ms"]
            + record["store_ms"],
            2,
        )
        record["status"] = "indexed"

    except Exception as exc:
        await db.rollback()
        doc_row = await db.get(Document, doc.id)
        if doc_row is not None:
            doc_row.status = ProcessingStatus.failed
            await db.commit()
        record["status"] = "failed"
        record["error"] = f"{type(exc).__name__}: {exc}"

    return record


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True, help="folder of documents to ingest")
    ap.add_argument("--chunk-size", type=int, default=None)
    ap.add_argument("--chunk-overlap", type=int, default=None)
    ap.add_argument("--label", default="", help="optional extra tag for the config id")
    ap.add_argument("--reset", action="store_true", help="delete this config's docs first")
    ap.add_argument("--out", default=None, help="result filename")
    args = ap.parse_args()

    settings = get_settings()
    if args.chunk_size is not None:
        settings.chunk_size = args.chunk_size
    if args.chunk_overlap is not None:
        settings.chunk_overlap = args.chunk_overlap

    cfg = {
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "embedding_model": settings.embedding_model,
        "label": args.label,
    }
    user_id = config_id(**cfg)
    print(f"[config] {cfg}")
    print(f"[config] user_id={user_id}")

    corpus = Path(args.corpus).resolve()
    files = sorted(
        p
        for p in corpus.rglob("*")
        if p.is_file() and p.suffix.lstrip(".").lower() in SUPPORTED_EXTENSIONS
    )
    if not files:
        raise SystemExit(f"No supported documents found under {corpus}")
    print(f"[corpus] {len(files)} document(s) in {corpus}")

    engine = create_async_engine(eval_database_url(), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    embedder = get_embedding_service()
    t = time.perf_counter()
    embedder.warm_up()
    model_load_ms = round((time.perf_counter() - t) * 1000, 2)

    # warm_up() only builds the ONNX session. The first actual inference pays
    # for graph optimisation and thread-pool startup -- tens of seconds on this
    # machine -- which would otherwise land entirely on whichever document
    # happens to be ingested first and make its timing meaningless. Burn that
    # cost here, on a throwaway input, so the per-document numbers are clean.
    t = time.perf_counter()
    embedder.embed(["warm-up inference, result discarded"])
    first_inference_ms = round((time.perf_counter() - t) * 1000, 2)

    # chunk_pages() imports langchain_text_splitters lazily, and that import
    # costs seconds the first time. Same problem: it would be billed to the
    # first document. Pay it here instead.
    from app.ingestion.parser import ParsedPage

    t = time.perf_counter()
    chunk_pages([ParsedPage(page_number=1, text="warm-up")], document_id="warm-up", filename="warm-up")
    chunker_import_ms = round((time.perf_counter() - t) * 1000, 2)

    print(
        f"[model] session {model_load_ms} ms, first inference {first_inference_ms} ms, "
        f"chunker import {chunker_import_ms} ms"
    )

    records = []
    async with Session() as db:
        await db.execute(text("SELECT 1"))
        await ensure_user(db, user_id)
        if args.reset:
            removed = await reset_config(db, user_id)
            print(f"[reset] removed {removed} previously ingested document(s)")

        for i, path in enumerate(files, 1):
            rec = await ingest_one(path, user_id, db, embedder)
            records.append(rec)
            print(
                f"[{i}/{len(files)}] {path.name}: {rec['status']} "
                f"pages={rec.get('pages')} chunks={rec.get('chunks')} "
                f"total={rec.get('total_ms')}ms"
            )

    await engine.dispose()

    ok = [r for r in records if r["status"] == "indexed"]
    payload = {
        "config": cfg,
        "user_id": user_id,
        "corpus_dir": str(corpus),
        "model_load_ms": model_load_ms,
        "model_first_inference_ms": first_inference_ms,
        "chunker_import_ms": chunker_import_ms,
        "documents_attempted": len(records),
        "documents_indexed": len(ok),
        "documents_failed": len(records) - len(ok),
        "total_pages": sum(r.get("pages", 0) for r in ok),
        "total_chunks": sum(r.get("chunks", 0) for r in ok),
        "total_chars": sum(r.get("chars", 0) for r in ok),
        "total_bytes": sum(r.get("file_size_bytes", 0) for r in ok),
        "documents": records,
    }
    save(args.out or f"ingest_{user_id}.json", payload)
    print(
        f"[done] indexed={len(ok)}/{len(records)} "
        f"chunks={payload['total_chunks']} pages={payload['total_pages']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
