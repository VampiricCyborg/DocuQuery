"""
Performance benchmark: embedding throughput, retrieval latency, LLM latency.

Ingestion-stage timings (parse / clean / chunk / embed / store) are produced by
ingest_corpus.py and are not repeated here; this script covers the query side
plus a standalone embedding throughput measurement.

Every latency figure is reported as a distribution (min / P50 / P95 / P99 / max)
over a stated number of runs, after a discarded warm-up, so no number here is a
single lucky run.

The --llm stage sends retrieved passages from the corpus to the configured LLM
provider over the network and consumes API quota. It is off by default.

Usage:
    python evaluation/run_perf_bench.py --user-id eval-xxxx
    python evaluation/run_perf_bench.py --user-id eval-xxxx --llm --llm-queries 20
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import time

from _common import eval_database_url, load, percentiles, save

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.ingestion.embeddings import get_embedding_service
from app.llm import get_response_generator
from app.retrieval.embedding_query import embed_query
from app.retrieval.exceptions import NoResultsError
from app.retrieval.retrieval_pipeline import run_retrieval_pipeline


def proc_sample() -> dict:
    try:
        import psutil
    except ImportError:
        return {}
    p = psutil.Process(os.getpid())
    return {
        "rss_mb": round(p.memory_info().rss / 1024**2, 1),
        "cpu_percent": p.cpu_percent(interval=None),
    }


def bench_embedding(texts: list[str], batch_sizes: tuple[int, ...]) -> dict:
    """
    Embedding throughput at several batch sizes.

    The same text list is embedded each time so the only variable is batching.
    """
    settings = get_settings()
    service = get_embedding_service()

    t = time.perf_counter()
    service.warm_up()
    cold_load_ms = round((time.perf_counter() - t) * 1000, 2)

    service.embed(texts[:8])  # warm-up, result discarded

    results = {}
    original = settings.embedding_batch_size
    for batch_size in batch_sizes:
        settings.embedding_batch_size = batch_size
        t = time.perf_counter()
        vectors = service.embed(texts)
        elapsed = time.perf_counter() - t
        results[f"batch_{batch_size}"] = {
            "texts": len(texts),
            "seconds": round(elapsed, 3),
            "embeddings_per_second": round(len(texts) / elapsed, 1),
            "ms_per_embedding": round(elapsed * 1000 / len(texts), 3),
            "dim": len(vectors[0]),
        }
        print(f"[embed] batch={batch_size}: {results[f'batch_{batch_size}']}")
    settings.embedding_batch_size = original

    return {
        "cold_load_ms": cold_load_ms,
        "model": settings.embedding_model,
        "by_batch_size": results,
        "process_after": proc_sample(),
    }


async def bench_query_embedding(queries: list[str], repeats: int) -> dict:
    samples = []
    for _ in range(repeats):
        for query in queries:
            t = time.perf_counter()
            await embed_query(query)
            samples.append((time.perf_counter() - t) * 1000)
    return percentiles(samples)


async def bench_retrieval(db, user_id: str, queries: list[str], top_k: int, repeats: int) -> dict:
    samples = []
    empty = 0
    chunk_counts = []
    context_chars = []
    for _ in range(repeats):
        for query in queries:
            t = time.perf_counter()
            try:
                result = await run_retrieval_pipeline(
                    query=query, db=db, user_id=user_id, top_k=top_k
                )
                chunk_counts.append(len(result.chunks))
                context_chars.append(len(result.context))
            except NoResultsError:
                empty += 1
            samples.append((time.perf_counter() - t) * 1000)
    return {
        "latency_ms": percentiles(samples),
        "queries_per_second_serial": round(1000 / statistics.median(samples), 2) if samples else None,
        "empty_results": empty,
        "chunks_returned_mean": round(statistics.mean(chunk_counts), 2) if chunk_counts else None,
        "context_chars_mean": round(statistics.mean(context_chars), 1) if context_chars else None,
        "context_chars_max": max(context_chars) if context_chars else None,
    }


async def bench_concurrent_retrieval(
    engine, user_id: str, queries: list[str], top_k: int, concurrency: int
) -> dict:
    """Wall-clock throughput with N retrievals in flight, each on its own session."""
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def one(query: str) -> float:
        async with Session() as db:
            t = time.perf_counter()
            try:
                await run_retrieval_pipeline(query=query, db=db, user_id=user_id, top_k=top_k)
            except NoResultsError:
                pass
            return (time.perf_counter() - t) * 1000

    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(query: str) -> float:
        async with semaphore:
            return await one(query)

    t0 = time.perf_counter()
    samples = await asyncio.gather(*(guarded(q) for q in queries))
    wall = time.perf_counter() - t0

    return {
        "concurrency": concurrency,
        "queries": len(queries),
        "wall_seconds": round(wall, 3),
        "queries_per_second": round(len(queries) / wall, 2),
        "latency_ms": percentiles(list(samples)),
    }


async def bench_llm(db, user_id: str, queries: list[str], top_k: int) -> dict:
    """
    Time to first streamed token and full generation latency, over real calls.

    Generation goes through ResponseGenerator.stream -- the same call POST /chat
    makes -- so context truncation, the versioned system prompt and SSE framing
    are all in the measured path. Retrieval is timed separately, so
    time_to_first_token_ms excludes it and end_to_end_ms is what a user waits
    for from question to last token.
    """
    settings = get_settings()
    generator = get_response_generator()

    ttft, generation, end_to_end, retrieval, chars, tokens, errors = [], [], [], [], [], [], []

    for i, query in enumerate(queries, 1):
        t_start = time.perf_counter()
        try:
            result = await run_retrieval_pipeline(
                query=query, db=db, user_id=user_id, top_k=top_k
            )
        except NoResultsError:
            continue
        t_retrieved = time.perf_counter()

        first_token_at = None
        token_events = 0
        answer_chars = 0
        try:
            async for event in generator.stream(query, result, mode="docuquery"):
                if not event.startswith("event: token"):
                    continue
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                token_events += 1
                answer_chars += len(event) - len("event: token\ndata: \n\n")
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            print(f"[{i}] llm error: {type(exc).__name__}: {exc}")
            continue

        t_end = time.perf_counter()
        if first_token_at is None:
            errors.append("stream produced no tokens")
            continue

        retrieval.append((t_retrieved - t_start) * 1000)
        ttft.append((first_token_at - t_retrieved) * 1000)
        generation.append((t_end - t_retrieved) * 1000)
        end_to_end.append((t_end - t_start) * 1000)
        chars.append(float(answer_chars))
        tokens.append(float(token_events))
        print(
            f"[{i}/{len(queries)}] ttft={ttft[-1]:.0f}ms "
            f"total={end_to_end[-1]:.0f}ms tokens={token_events}"
        )

    return {
        "provider": settings.llm_provider,
        "model": settings.llm_model,
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
        "max_context_tokens": settings.llm_max_context_tokens,
        "completed": len(ttft),
        "errors": errors,
        "retrieval_ms": percentiles(retrieval),
        "time_to_first_token_ms": percentiles(ttft),
        "generation_ms": percentiles(generation),
        "end_to_end_ms": percentiles(end_to_end),
        "streamed_token_events": percentiles(tokens),
        "answer_chars": percentiles(chars),
        "note": (
            "streamed_token_events counts provider stream deltas, not tokeniser "
            "tokens; answer_chars is JSON-escaped length and is an upper bound"
        ),
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", required=True)
    ap.add_argument("--eval-set", default="eval_set.json")
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--embed-texts", type=int, default=256)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--llm", action="store_true", help="run real LLM calls (uses quota)")
    ap.add_argument("--llm-queries", type=int, default=20)
    ap.add_argument("--out", default="perf_bench.json")
    args = ap.parse_args()

    eval_set = load(args.eval_set)
    queries = [q["query"] for q in eval_set["queries"]]
    passages = [q["gt_passage"] for q in eval_set["queries"]]
    print(f"[bench] {len(queries)} queries available")

    payload: dict = {"config": vars(args), "process_start": proc_sample()}

    texts = (passages * ((args.embed_texts // max(1, len(passages))) + 1))[: args.embed_texts]
    payload["embedding"] = bench_embedding(texts, batch_sizes=(1, 8, 32, 64))

    engine = create_async_engine(eval_database_url(), pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        payload["query_embedding_ms"] = await bench_query_embedding(queries[:20], args.repeats)
        print(f"[query-embed] {payload['query_embedding_ms']}")

        payload["retrieval"] = await bench_retrieval(
            db, args.user_id, queries, args.top_k, args.repeats
        )
        print(f"[retrieval] {payload['retrieval']['latency_ms']}")

    payload["retrieval_concurrent"] = await bench_concurrent_retrieval(
        engine, args.user_id, queries, args.top_k, args.concurrency
    )
    print(f"[concurrent] {payload['retrieval_concurrent']}")

    if args.llm:
        async with Session() as db:
            payload["llm"] = await bench_llm(
                db, args.user_id, queries[: args.llm_queries], args.top_k
            )
    else:
        payload["llm"] = {"skipped": "run with --llm to measure generation latency"}

    await engine.dispose()

    payload["process_end"] = proc_sample()
    save(args.out, payload)


if __name__ == "__main__":
    asyncio.run(main())
