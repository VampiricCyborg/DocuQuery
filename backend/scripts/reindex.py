"""
Re-run ingestion for documents whose chunks are no longer searchable.

Migration a9f3d6c1b5e8 cleared every embedding when the model changed dimensions,
and d5e2c8a7f1b3 marks the documents it stranded as `failed`. This script is the
repair step: it rebuilds those documents' chunks and embeddings from the files
still on disk.

    # one document
    python -m scripts.reindex --document-id 6da1be77-be1f-4d76-9b7d-1a4d19218b9c

    # every failed document whose source file still exists
    python -m scripts.reindex --all-failed

    # see what would happen and touch nothing
    python -m scripts.reindex --all-failed --dry-run

Run it from the `backend/` directory with the same environment the API uses, so
that DATABASE_URL and the embedding model directory resolve identically.

Documents are processed one at a time on purpose. Embedding is CPU-bound and the
Railway instance that runs this is the same one serving traffic; a parallel
rebuild is how the earlier OOM crash happened.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import configure_logging
from app.database.models import Document, DocumentChunk, ProcessingStatus
from app.database.session import AsyncSessionLocal
from app.ingestion.pipeline import run_ingestion_pipeline

logger = logging.getLogger("reindex")


async def _select_documents(
    db: AsyncSession, document_id: str | None, all_failed: bool
) -> list[Document]:
    if document_id:
        doc = await db.scalar(select(Document).where(Document.id == document_id))
        return [doc] if doc else []

    if all_failed:
        result = await db.execute(
            select(Document)
            .where(Document.status == ProcessingStatus.failed)
            .order_by(Document.upload_time)
        )
        return list(result.scalars().all())

    return []


async def _reindex_one(db: AsyncSession, doc: Document, dry_run: bool) -> bool:
    """Rebuild one document's chunks. Returns True when it ends up indexed."""
    source = Path(doc.storage_path)
    if not source.is_file():
        # The row survives a lost file, but nothing can be rebuilt from it. Leaving
        # the status at `failed` is accurate; the operator has to re-upload.
        logger.warning(
            "SKIP  %s  %r — file is gone (%s)", doc.id, doc.original_filename, doc.storage_path
        )
        return False

    if dry_run:
        logger.info(
            "WOULD REINDEX  %s  %r  status=%s  chunks=%d",
            doc.id, doc.original_filename, doc.status.value, doc.total_chunks,
        )
        return False

    # store_chunks appends rather than replacing, so stale rows -- including the
    # NULL-embedding ones this script exists to clear -- must go first or the
    # document ends up with two generations of chunks and doubled retrieval hits.
    deleted = await db.execute(
        delete(DocumentChunk).where(DocumentChunk.document_id == doc.id)
    )
    doc.total_chunks = 0
    await db.commit()
    logger.info(
        "REINDEX  %s  %r — cleared %d stale chunk(s)",
        doc.id, doc.original_filename, deleted.rowcount or 0,
    )

    # The pipeline owns its own status transitions and swallows exceptions, so the
    # outcome is read back from the row rather than caught here.
    await run_ingestion_pipeline(
        document_id=doc.id,
        storage_path=doc.storage_path,
        filename=doc.original_filename,
        db=db,
    )

    await db.refresh(doc)
    if doc.status == ProcessingStatus.indexed:
        logger.info("OK  %s  %r — %d chunk(s)", doc.id, doc.original_filename, doc.total_chunks)
        return True

    logger.error(
        "FAILED  %s  %r — status=%s after reindex; see the pipeline log above",
        doc.id, doc.original_filename, doc.status.value,
    )
    return False


async def reindex(document_id: str | None, all_failed: bool, dry_run: bool) -> int:
    async with AsyncSessionLocal() as db:
        documents = await _select_documents(db, document_id, all_failed)

        if not documents:
            if document_id:
                logger.error("No document with id %s", document_id)
                return 1
            logger.info("Nothing to do — no documents with status='failed'.")
            return 0

        logger.info(
            "%s %d document(s)%s",
            "Would reindex" if dry_run else "Reindexing",
            len(documents),
            " (dry run)" if dry_run else "",
        )

        succeeded = 0
        for doc in documents:
            if await _reindex_one(db, doc, dry_run):
                succeeded += 1

        if dry_run:
            return 0

        failed = len(documents) - succeeded
        logger.info("Done — %d succeeded, %d still failed.", succeeded, failed)
        # A non-zero exit lets this be chained in a deploy script without the
        # caller having to parse the log.
        return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild chunks and embeddings for documents that are not searchable."
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--document-id", help="Reindex exactly this document.")
    target.add_argument(
        "--all-failed",
        action="store_true",
        help="Reindex every document with status='failed' whose file still exists.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List what would be reindexed without modifying anything.",
    )
    args = parser.parse_args()

    configure_logging()
    return asyncio.run(reindex(args.document_id, args.all_failed, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
