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

Usage:
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx --no-threshold
    python evaluation/run_retrieval_eval.py --user-id eval-xxxx --filter-document
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


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", required=True)
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
