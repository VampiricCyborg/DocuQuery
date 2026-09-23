"""
Score the retrieval pipeline against a fixed ground-truth query set.

Every query goes through app.retrieval.run_retrieval_pipeline -- the same
function POST /retrieve and POST /chat call -- so what is measured is the
deployed path: query embedding, the per-user SQL filter, the pgvector HNSW
search, the similarity threshold, deduplication and ranking.

Three relevance levels are scored, from loosest to strictest:

  document   the retrieved chunk came from the document the query was written from
  page       ... and from the same page            -> page-level citation accuracy
  answer     the retrieved chunk text contains the answer span the generator
             quoted                                 -> answer-bearing chunk accuracy

Ground truth names exactly one relevant page per query, so Recall@k and
Hit Rate@k are the same quantity here: the share of queries with at least one
relevant chunk in the top k. Both names are reported with that caveat attached
rather than presented as two independent results.

Follow-up mode (--mode followup) measures something different: turn 2 of a
two-turn exchange, retrieved three ways -- on the user's literal follow-up, on
the condenser's rewrite of it, and on the slice's hand-written reference rewrite.
That is the number query condensing has to justify itself with.

Usage:
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx --no-threshold
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx --filter-document
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx --mode followup
"""

from __future__ import annotations

import argparse
import asyncio
import math
import re
import time

from _common import eval_database_url, load, percentiles, save

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.retrieval.exceptions import NoResultsError
from app.retrieval.filters import RetrievalFilter
from app.retrieval.retrieval_pipeline import run_retrieval_pipeline

K_VALUES = (1, 3, 5, 10)
LEVELS = ("document", "page", "answer")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def relevance(chunk, query: dict, level: str) -> bool:
    if chunk.document_id != query["gt_document_id"]:
        return False
    if level == "document":
        return True
    if chunk.page != query["gt_page"]:
        return False
    if level == "page":
        return True
    span = normalize(query.get("answer_span", ""))
    return bool(span) and span in normalize(chunk.text)


def ndcg_at_k(relevances: list[bool], k: int) -> float:
    """Binary-gain NDCG. Ideal ranking puts every relevant hit first."""
    top = relevances[:k]
    dcg = sum(1.0 / math.log2(i + 2) for i, rel in enumerate(top) if rel)
    ideal_hits = min(sum(top), k)
    if ideal_hits == 0:
        return 0.0
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_hits))
    return dcg / idcg


def score_level(per_query: list[list[bool]]) -> dict:
    """Aggregate one relevance level across all queries."""
    n = len(per_query)
    if n == 0:
        return {}

    out: dict = {"queries": n}
    for k in K_VALUES:
        hits = sum(1 for rels in per_query if any(rels[:k]))
        out[f"recall_at_{k}"] = round(hits / n, 4)
        out[f"precision_at_{k}"] = round(
            sum(sum(rels[:k]) / k for rels in per_query) / n, 4
        )
        out[f"ndcg_at_{k}"] = round(sum(ndcg_at_k(rels, k) for rels in per_query) / n, 4)

    out["hit_rate_at_5"] = out["recall_at_5"]
    out["hit_rate_at_5_note"] = (
        "identical to recall_at_5: ground truth names one relevant page per query"
    )

    reciprocal = []
    for rels in per_query:
        rank = next((i + 1 for i, rel in enumerate(rels) if rel), None)
        reciprocal.append(1.0 / rank if rank else 0.0)
    out["mrr"] = round(sum(reciprocal) / n, 4)

    return out


# --- Follow-up mode ---------------------------------------------------------
#
# Measures the one thing query condensing exists for: whether turn 2 of a
# conversation retrieves better when the elliptical follow-up is rewritten into a
# standalone query than when it is embedded literally.
#
# Three variants run over the same items, so the columns are comparable:
#
#   raw                the user's literal turn-2 text -- what shipped before
#   model_rewrite      app.llm.condenser's output, i.e. the deployed path
#   reference_rewrite  the hand-written rewrite in the slice, a ceiling for what
#                      a perfect condenser could achieve on this corpus
#
# Ground truth in this slice names documents by their manifest id, never by
# database document_id, because the latter is regenerated on every ingest. The
# join is through the filename the corpus was ingested under.

FOLLOWUP_LEVEL = "document"

# The condenser needs something to stand in for the assistant's turn-1 reply.
# Generating one would put a second, non-deterministic LLM call in the middle of
# a measurement; the top retrieved passage is what a grounded answer would have
# been written from, so it is used instead. This is a proxy, and it is recorded
# in the result file as one.
PROXY_ANSWER_CHARS = 600


def load_manifest_filenames(path: str) -> dict[str, str]:
    """manifest id -> the filename the corpus was ingested under."""
    import json
    from pathlib import Path

    manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    return {doc["id"]: doc["filename"] for doc in manifest["documents"]}


def load_followup_items(path: str) -> tuple[list[dict], dict]:
    import json
    from pathlib import Path

    blob = json.loads(Path(path).read_text(encoding="utf-8"))
    slice_ = blob["slices"]["followup"]
    provenance = {
        "set_status": blob.get("status"),
        "slice_description": slice_.get("description"),
        "verification": blob.get("verification", {}).get("not_verified"),
    }
    return slice_["items"], provenance


async def retrieve_filenames(db, query: str, user_id: str, top_k: int) -> list[str]:
    """Filenames of the top-k chunks, in rank order. Empty when nothing clears."""
    try:
        result = await run_retrieval_pipeline(
            query=query, db=db, user_id=user_id, top_k=top_k, filters=None
        )
    except NoResultsError:
        return []
    return [chunk.filename for chunk in result.chunks]


async def retrieve_chunks(db, query: str, user_id: str, top_k: int):
    try:
        result = await run_retrieval_pipeline(
            query=query, db=db, user_id=user_id, top_k=top_k, filters=None
        )
    except NoResultsError:
        return []
    return result.chunks


def recall_at(hits: list[list[bool]], k: int) -> float:
    if not hits:
        return 0.0
    return round(sum(1 for rels in hits if any(rels[:k])) / len(hits), 4)


async def run_followup(args) -> None:
    from app.llm import get_response_generator
    from app.llm.condenser import condense_query
    from app.llm.models import HistoryMessage

    settings = get_settings()
    settings.retrieval_max_context_chunks = max(
        settings.retrieval_max_context_chunks, args.top_k
    )

    items, provenance = load_followup_items(args.slice_file)
    filenames = load_manifest_filenames(args.manifest)
    print(f"[follow-up] {len(items)} two-turn items from {args.slice_file}")

    variants = ("raw", "model_rewrite", "reference_rewrite")
    per_variant: dict[str, list[list[bool]]] = {v: [] for v in variants}
    rewrite_latencies: list[float] = []
    rewrite_outcomes: dict[str, int] = {}
    rows: list[dict] = []

    provider = get_response_generator().provider

    engine = create_async_engine(eval_database_url(), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        for index, item in enumerate(items, 1):
            turn_1 = item["turn_1"]
            turn_2 = item["turn_2"]
            gt_filename = filenames.get(turn_2["gt_document_id"])
            if gt_filename is None:
                print(f"  [skip] {item['id']}: unknown manifest id {turn_2['gt_document_id']!r}")
                continue

            # Turn 1 establishes the conversation the follow-up depends on.
            turn_1_chunks = await retrieve_chunks(db, turn_1["query"], args.user_id, args.top_k)
            proxy_answer = (
                turn_1_chunks[0].text[:PROXY_ANSWER_CHARS] if turn_1_chunks else ""
            )
            history = [
                HistoryMessage(role="user", content=turn_1["query"]),
                HistoryMessage(role="assistant", content=proxy_answer),
            ]

            condensed = await condense_query(provider, turn_2["query"], history)
            rewrite_outcomes[condensed.outcome] = rewrite_outcomes.get(condensed.outcome, 0) + 1
            if condensed.outcome == "ok":
                rewrite_latencies.append(condensed.latency_ms)

            queries = {
                "raw": turn_2["query"],
                "model_rewrite": condensed.query,
                "reference_rewrite": item["reference_rewrite"],
            }

            retrieved: dict[str, list[str]] = {}
            for variant in variants:
                names = await retrieve_filenames(db, queries[variant], args.user_id, args.top_k)
                retrieved[variant] = names
                per_variant[variant].append([name == gt_filename for name in names])

            rows.append(
                {
                    "id": item["id"],
                    "turn_1": turn_1["query"],
                    "turn_2_raw": turn_2["query"],
                    "model_rewrite": condensed.query,
                    "rewrite_outcome": condensed.outcome,
                    "rewrite_latency_ms": round(condensed.latency_ms, 2),
                    "reference_rewrite": item["reference_rewrite"],
                    "gt_manifest_id": turn_2["gt_document_id"],
                    "gt_filename": gt_filename,
                    "turn_1_top_filename": turn_1_chunks[0].filename if turn_1_chunks else None,
                    "retrieved_filenames": retrieved,
                    "hit_at_5": {
                        variant: any(per_variant[variant][-1][:5]) for variant in variants
                    },
                }
            )
            print(f"  [{index}/{len(items)}] {item['id']} scored")

    await engine.dispose()

    metrics = {
        variant: {
            "queries": len(per_variant[variant]),
            **{f"recall_at_{k}": recall_at(per_variant[variant], k) for k in K_VALUES},
        }
        for variant in variants
    }

    payload = {
        "run": {
            "label": args.label,
            "mode": "followup",
            "user_id": args.user_id,
            "slice_file": args.slice_file,
            "items": len(rows),
            "top_k": args.top_k,
            "similarity_threshold": settings.retrieval_similarity_threshold,
            "embedding_model": settings.embedding_model,
            "llm_model": settings.llm_model,
            "condense_prompt_version": "v1",
            "relevance_level": FOLLOWUP_LEVEL,
            "turn_1_answer": (
                "proxy: the top retrieved passage from turn 1, truncated to "
                f"{PROXY_ANSWER_CHARS} chars. No answer was generated, so the "
                "condenser sees grounded context rather than a written reply."
            ),
        },
        "provenance": provenance,
        "metrics": metrics,
        "rewrite_outcomes": rewrite_outcomes,
        "rewrite_latency_ms": percentiles(rewrite_latencies),
        "per_item": rows,
    }

    name = args.out or f"retrieval_eval_followup_{args.label or args.user_id}.json"
    save(name, payload)

    print()
    print("=== turn-2 retrieval, document level ===")
    print(f"{'variant':20s} {'n':>4s} {'R@1':>7s} {'R@3':>7s} {'R@5':>7s}")
    for variant in variants:
        m = metrics[variant]
        print(
            f"{variant:20s} {m['queries']:4d} "
            f"{m['recall_at_1']:7.3f} {m['recall_at_3']:7.3f} {m['recall_at_5']:7.3f}"
        )
    latency = payload["rewrite_latency_ms"]
    print()
    print(f"rewrite latency ms: P50={latency['p50']} P95={latency['p95']} n={latency['n']}")
    print(f"rewrite outcomes:   {rewrite_outcomes}")
    if provenance.get("set_status"):
        print()
        print(f"NOTE: {provenance['set_status']}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", required=True)
    ap.add_argument(
        "--mode",
        choices=("standard", "followup"),
        default="standard",
        help="standard scores the generated eval set; followup scores turn 2 of the "
             "two-turn slice with and without query condensing",
    )
    ap.add_argument(
        "--slice-file",
        default="evaluation/sets/manual.json",
        help="follow-up mode only: the hand-written slice file",
    )
    ap.add_argument(
        "--manifest",
        default="evaluation/corpus/manifest.json",
        help="follow-up mode only: maps the slice's manifest ids to ingested filenames",
    )
    ap.add_argument("--eval-set", default="eval_set.json")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--no-threshold",
        action="store_true",
        help="set the similarity threshold to 0 for this run",
    )
    ap.add_argument(
        "--filter-document",
        action="store_true",
        help="pass the ground-truth document_id as a metadata filter",
    )
    ap.add_argument("--label", default="")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if args.mode == "followup":
        await run_followup(args)
        return

    settings = get_settings()
    original_threshold = settings.retrieval_similarity_threshold
    if args.no_threshold:
        settings.retrieval_similarity_threshold = 0.0
    # The pipeline caps results at min(top_k, retrieval_max_context_chunks);
    # raise the cap so a top_k of 10 is actually returned.
    settings.retrieval_max_context_chunks = max(
        settings.retrieval_max_context_chunks, args.top_k
    )

    eval_set = load(args.eval_set)
    queries = eval_set["queries"]
    print(f"[eval-set] {len(queries)} queries from {args.eval_set}")

    engine = create_async_engine(eval_database_url(), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    rows: list[dict] = []
    latencies: list[float] = []
    per_level: dict[str, list[list[bool]]] = {level: [] for level in LEVELS}
    answer_span_scorable = 0
    empty_results = 0

    async with Session() as db:
        for i, query in enumerate(queries, 1):
            filters = (
                RetrievalFilter(document_id=query["gt_document_id"])
                if args.filter_document
                else None
            )

            t0 = time.perf_counter()
            try:
                result = await run_retrieval_pipeline(
                    query=query["query"],
                    db=db,
                    user_id=args.user_id,
                    top_k=args.top_k,
                    filters=filters,
                )
                chunks = result.chunks
            except NoResultsError:
                chunks = []
                empty_results += 1
            latency_ms = (time.perf_counter() - t0) * 1000
            latencies.append(latency_ms)

            rels = {level: [relevance(c, query, level) for c in chunks] for level in LEVELS}

            # A query can only be scored at answer-span level if the generator
            # actually quoted a span that appears in the passage it was given.
            span = normalize(query.get("answer_span", ""))
            span_scorable = bool(span) and span in normalize(query["gt_passage"])
            if span_scorable:
                answer_span_scorable += 1

            for level in LEVELS:
                if level == "answer" and not span_scorable:
                    continue
                per_level[level].append(rels[level])

            first_rank = {
                level: next((j + 1 for j, r in enumerate(rels[level]) if r), None)
                for level in LEVELS
            }

            rows.append(
                {
                    "query_id": query["query_id"],
                    "query": query["query"],
                    "gt_filename": query["gt_filename"],
                    "gt_page": query["gt_page"],
                    "answer_span_scorable": span_scorable,
                    "retrieved": [
                        {
                            "rank": j + 1,
                            "filename": c.filename,
                            "page": c.page,
                            "chunk_index": c.chunk_index,
                            "similarity": round(c.similarity, 4),
                            "relevant_document": rels["document"][j],
                            "relevant_page": rels["page"][j],
                            "relevant_answer": rels["answer"][j],
                        }
                        for j, c in enumerate(chunks)
                    ],
                    "first_relevant_rank": first_rank,
                    "latency_ms": round(latency_ms, 2),
                    "n_retrieved": len(chunks),
                }
            )

            if i % 10 == 0:
                print(f"[{i}/{len(queries)}] scored")

    await engine.dispose()

    metrics = {level: score_level(per_level[level]) for level in LEVELS}
    metrics["answer"]["scorable_queries"] = answer_span_scorable
    metrics["answer"]["note"] = (
        "scored only on queries whose generated answer span is present verbatim "
        "in the ground-truth passage"
    )

    payload = {
        "run": {
            "label": args.label,
            "user_id": args.user_id,
            "eval_set": args.eval_set,
            "eval_set_size": len(queries),
            "top_k": args.top_k,
            "similarity_threshold": settings.retrieval_similarity_threshold,
            "similarity_threshold_default": original_threshold,
            "metadata_filter": "document_id" if args.filter_document else "none",
            "embedding_model": settings.embedding_model,
            "vector_distance": "cosine (pgvector <=>, HNSW index)",
        },
        "metrics": metrics,
        "queries_with_no_results": empty_results,
        "retrieval_latency_ms": percentiles(latencies),
        "per_query": rows,
    }

    name = args.out or f"retrieval_eval_{args.label or args.user_id}.json"
    save(name, payload)

    print("\n=== retrieval metrics ===")
    for level in LEVELS:
        m = metrics[level]
        print(
            f"{level:9s} n={m['queries']:3d}  "
            f"R@1={m['recall_at_1']:.3f}  R@3={m['recall_at_3']:.3f}  "
            f"R@5={m['recall_at_5']:.3f}  MRR={m['mrr']:.3f}  "
            f"NDCG@5={m['ndcg_at_5']:.3f}  P@5={m['precision_at_5']:.3f}"
        )
    print(f"\nlatency ms: {payload['retrieval_latency_ms']}")
    print(f"queries returning nothing: {empty_results}")


if __name__ == "__main__":
    asyncio.run(main())
