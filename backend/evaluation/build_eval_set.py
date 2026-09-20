"""
Build a ground-truth retrieval query set from an indexed corpus.

Method
------
1. Read every indexed page of the corpus back out of the database, reassembled
   from its chunks so the passage text is exactly what was indexed.
2. Select candidate passages deterministically (fixed seed, stated filters).
   Passages that are too short, mostly digits, or mostly punctuation are
   rejected before any query is generated, because a question generated from
   a table of page numbers has no defensible ground truth.
3. Ask the configured LLM to write a natural question answerable *only* from
   that passage, and to name the short span that answers it.
4. Ground truth for the query is the passage's (document_id, page_number) plus
   the passage text itself.

Why ground truth is anchored to (document, page) rather than to a chunk id:
chunk ids change when chunk size changes, so a chunk-anchored query set cannot
be reused across chunking configurations. Anchoring to the page keeps one fixed
query set valid for every configuration under test, which is what makes the
chunking sweep a like-for-like comparison.

The generator never sees retrieval output. This file is written once and is not
edited afterwards; scores are computed against it as-is.

Usage:
    python evaluation/build_eval_set.py --user-id eval-xxxx --n 80
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import re
import time
from collections import defaultdict

from _common import RESULTS_DIR, eval_database_url, save

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.database.models import Document, DocumentChunk, ProcessingStatus
from app.llm.models import LLMRequest
from app.llm.providers import get_provider

GENERATOR_SYSTEM_PROMPT = """You write evaluation questions for a document search system.

You are given one passage from a document. Write exactly one question that:
- is answerable using ONLY that passage
- a real person might plausibly ask about this document
- does NOT quote the passage verbatim; use your own wording
- does NOT refer to "the passage", "the text", "the document", "above", or "this section"
- names the specific subject it asks about, so it is meaningful without seeing the passage

Also quote the shortest span from the passage that answers it.

Respond with JSON only, no prose, no code fences:
{"question": "...", "answer_span": "..."}

If the passage is boilerplate, a table of contents, a page header, a reference
list, or otherwise has no factual content worth asking about, respond exactly:
{"question": null, "answer_span": null}"""

MIN_PASSAGE_CHARS = 400
MAX_PASSAGE_CHARS = 2400


def is_usable(text: str) -> tuple[bool, str]:
    """Reject passages that cannot support a defensible ground-truth question."""
    stripped = text.strip()
    if len(stripped) < MIN_PASSAGE_CHARS:
        return False, "too_short"

    letters = sum(c.isalpha() for c in stripped)
    if letters / len(stripped) < 0.55:
        return False, "not_enough_prose"

    words = re.findall(r"[A-Za-z]{2,}", stripped)
    if len(words) < 60:
        return False, "too_few_words"
    if len(set(w.lower() for w in words)) / len(words) < 0.35:
        return False, "too_repetitive"

    return True, "ok"


async def load_pages(db, user_id: str) -> list[dict]:
    """Reassemble each indexed page from its chunks, in chunk order."""
    rows = (
        await db.execute(
            select(DocumentChunk, Document.original_filename)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(Document.user_id == user_id)
            .where(Document.status == ProcessingStatus.indexed)
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        )
    ).all()

    grouped: dict[tuple[str, int], dict] = defaultdict(
        lambda: {"texts": [], "chunk_indexes": []}
    )
    for chunk, filename in rows:
        key = (chunk.document_id, chunk.page_number)
        entry = grouped[key]
        entry["document_id"] = chunk.document_id
        entry["filename"] = filename
        entry["page_number"] = chunk.page_number
        entry["texts"].append(chunk.text)
        entry["chunk_indexes"].append(chunk.chunk_index)

    pages = []
    for entry in grouped.values():
        # Chunks overlap, so joining them repeats the overlap region. That is
        # fine for question generation -- the passage only needs to be faithful
        # to what was indexed, and overlap duplication does not invent content.
        entry["text"] = "\n".join(entry.pop("texts"))
        pages.append(entry)

    pages.sort(key=lambda p: (p["filename"], p["page_number"]))
    return pages


def select_passages(pages: list[dict], n: int, seed: int) -> tuple[list[dict], dict]:
    """
    Pick n candidate passages, spread across documents, with a fixed seed.

    Documents are visited round-robin so a single long report cannot dominate
    the query set.
    """
    usable: list[dict] = []
    rejected: dict[str, int] = defaultdict(int)

    for page in pages:
        ok, reason = is_usable(page["text"])
        if ok:
            page = dict(page)
            page["text"] = page["text"].strip()[:MAX_PASSAGE_CHARS]
            usable.append(page)
        else:
            rejected[reason] += 1

    by_doc: dict[str, list[dict]] = defaultdict(list)
    for page in usable:
        by_doc[page["document_id"]].append(page)

    rng = random.Random(seed)
    for pages_of_doc in by_doc.values():
        rng.shuffle(pages_of_doc)

    order = sorted(by_doc)
    rng.shuffle(order)

    selected: list[dict] = []
    cursor = 0
    while len(selected) < n:
        added_this_round = False
        for doc_id in order:
            if cursor < len(by_doc[doc_id]):
                selected.append(by_doc[doc_id][cursor])
                added_this_round = True
                if len(selected) == n:
                    break
        if not added_this_round:
            break
        cursor += 1

    stats = {
        "pages_total": len(pages),
        "pages_usable": len(usable),
        "pages_rejected": dict(rejected),
        "documents_with_usable_pages": len(by_doc),
        "selected": len(selected),
    }
    return selected, stats


def parse_generated(raw: str) -> dict | None:
    """Pull the JSON object out of a model response, tolerating stray prose."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not data.get("question"):
        return None
    return data


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", required=True, help="config id from ingest_corpus.py")
    ap.add_argument("--n", type=int, default=80, help="target number of queries")
    ap.add_argument("--seed", type=int, default=20260920)
    ap.add_argument("--out", default="eval_set.json")
    args = ap.parse_args()

    settings = get_settings()
    engine = create_async_engine(eval_database_url(), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        pages = await load_pages(db, args.user_id)
    await engine.dispose()

    if not pages:
        raise SystemExit(f"No indexed pages found for user_id={args.user_id}")

    # Over-sample: some passages will be rejected by the generator as boilerplate.
    candidates, stats = select_passages(pages, int(args.n * 1.6), args.seed)
    print(f"[passages] {stats}")

    provider = get_provider(
        settings.llm_provider,
        api_key=settings.llm_api_key,
        ollama_base_url=settings.ollama_base_url,
        timeout=settings.llm_timeout,
    )

    queries: list[dict] = []
    skipped = 0
    errors = 0
    t_start = time.perf_counter()

    for i, page in enumerate(candidates, 1):
        if len(queries) >= args.n:
            break
        request = LLMRequest(
            system_prompt=GENERATOR_SYSTEM_PROMPT,
            user_message="Write the question.",
            context=f"PASSAGE (from {page['filename']}, page {page['page_number']}):\n{page['text']}",
            model=settings.llm_model,
            temperature=0.0,
            max_tokens=300,
        )
        try:
            response = await provider.generate(request)
        except Exception as exc:
            errors += 1
            print(f"[{i}] generation error: {type(exc).__name__}: {exc}")
            await asyncio.sleep(2.0)
            continue

        parsed = parse_generated(response.answer)
        if parsed is None:
            skipped += 1
            continue

        queries.append(
            {
                "query_id": f"q{len(queries) + 1:03d}",
                "query": parsed["question"].strip(),
                "answer_span": (parsed.get("answer_span") or "").strip(),
                "gt_document_id": page["document_id"],
                "gt_filename": page["filename"],
                "gt_page": page["page_number"],
                "gt_passage": page["text"],
                "gt_chunk_indexes": sorted(page["chunk_indexes"]),
            }
        )
        if len(queries) % 10 == 0:
            print(f"[{i}] generated {len(queries)}/{args.n}")

    elapsed = round(time.perf_counter() - t_start, 1)
    payload = {
        "source_user_id": args.user_id,
        "seed": args.seed,
        "target_n": args.n,
        "generator_model": settings.llm_model,
        "generator_provider": settings.llm_provider,
        "generator_temperature": 0.0,
        "generator_system_prompt": GENERATOR_SYSTEM_PROMPT,
        "passage_selection": stats,
        "candidates_offered": len(candidates),
        "queries_generated": len(queries),
        "passages_rejected_by_generator": skipped,
        "generation_errors": errors,
        "generation_seconds": elapsed,
        "documents_covered": len({q["gt_document_id"] for q in queries}),
        "queries": queries,
    }
    save(args.out, payload)
    print(
        f"[done] {len(queries)} queries across "
        f"{payload['documents_covered']} document(s) in {elapsed}s"
    )


if __name__ == "__main__":
    asyncio.run(main())
