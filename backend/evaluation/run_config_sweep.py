"""
Compare retrieval configurations on one fixed query set.

Two kinds of comparison are run:

  index-side   chunk size and overlap. Each configuration re-ingests the whole
               corpus under its own synthetic user, so the index really is
               rebuilt -- nothing is simulated by re-slicing an existing index.

  query-side   similarity threshold and metadata filtering. These reuse the
               baseline index, because neither of them changes what is stored.

The query set is generated once from the baseline index and reused verbatim by
every configuration. Ground truth is anchored to (document, page), which does
not move when chunk size changes, so the comparison is like-for-like.

Usage:
    python evaluation/run_config_sweep.py --corpus ../corpus --baseline-user-id eval-xxxx
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from _common import RESULTS_DIR, config_id, load, save

BACKEND_ROOT = Path(__file__).resolve().parent.parent

# (label, chunk_size, chunk_overlap). The first entry must be the shipped
# default so every improvement is stated relative to what the product does now.
INDEX_CONFIGS = [
    ("current-800-120", 800, 120),
    ("small-400-60", 400, 60),
    ("large-1200-180", 1200, 180),
    ("no-overlap-800-0", 800, 0),
]

# (label, extra flags for run_retrieval_eval.py)
QUERY_CONFIGS = [
    ("threshold-0.30-default", []),
    ("threshold-0.00", ["--no-threshold"]),
    ("metadata-filter-document", ["--filter-document"]),
]


def run(cmd: list[str]) -> None:
    print(f"\n$ {' '.join(cmd)}")
    # Run from backend/ so pydantic-settings finds .env, same as the app does.
    result = subprocess.run(cmd, cwd=BACKEND_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"command failed with exit code {result.returncode}")


def headline(metrics: dict) -> dict:
    """The comparable figures, pulled out of a full result file."""
    out = {}
    for level in ("document", "page", "answer"):
        m = metrics.get(level, {})
        out[level] = {
            key: m.get(key)
            for key in (
                "queries",
                "recall_at_1",
                "recall_at_3",
                "recall_at_5",
                "precision_at_5",
                "ndcg_at_5",
                "mrr",
            )
        }
    return out


def delta(baseline: float | None, candidate: float | None) -> dict:
    if baseline is None or candidate is None:
        return {"absolute_pp": None, "relative_pct": None}
    absolute = round((candidate - baseline) * 100, 2)
    relative = round((candidate - baseline) / baseline * 100, 2) if baseline else None
    return {"absolute_pp": absolute, "relative_pct": relative}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--eval-set", default="eval_set.json")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--skip-ingest",
        action="store_true",
        help="assume every index configuration is already ingested",
    )
    ap.add_argument("--out", default="config_sweep.json")
    args = ap.parse_args()

    eval_set = load(args.eval_set)
    embedding_model = eval_set.get("generator_model")
    print(f"[sweep] query set: {args.eval_set} ({len(eval_set['queries'])} queries)")

    from app.core.config import get_settings

    model_label = get_settings().embedding_model

    runs: dict[str, dict] = {}

    for label, chunk_size, overlap in INDEX_CONFIGS:
        user_id = config_id(
            chunk_size=chunk_size,
            chunk_overlap=overlap,
            embedding_model=model_label,
            label="",
        )
        if not args.skip_ingest:
            run(
                [
                    sys.executable,
                    "evaluation/ingest_corpus.py",
                    "--corpus",
                    str(Path(args.corpus).resolve()),
                    "--chunk-size",
                    str(chunk_size),
                    "--chunk-overlap",
                    str(overlap),
                    "--reset",
                ]
            )
        run(
            [
                sys.executable,
                "evaluation/run_retrieval_eval.py",
                "--user-id",
                user_id,
                "--eval-set",
                args.eval_set,
                "--top-k",
                str(args.top_k),
                "--label",
                label,
            ]
        )
        result = load(f"retrieval_eval_{label}.json")
        ingest = load(f"ingest_{user_id}.json")
        runs[label] = {
            "kind": "index",
            "chunk_size": chunk_size,
            "chunk_overlap": overlap,
            "user_id": user_id,
            "chunks_indexed": ingest["total_chunks"],
            "documents_indexed": ingest["documents_indexed"],
            "mean_chunk_chars": round(
                sum(
                    d.get("chunk_chars_mean", 0) * d.get("chunks", 0)
                    for d in ingest["documents"]
                    if d["status"] == "indexed"
                )
                / max(1, ingest["total_chunks"]),
                1,
            ),
            "retrieval_latency_ms": result["retrieval_latency_ms"],
            "queries_with_no_results": result["queries_with_no_results"],
            "metrics": headline(result["metrics"]),
        }

    baseline_label = INDEX_CONFIGS[0][0]
    baseline_user_id = runs[baseline_label]["user_id"]

    for label, flags in QUERY_CONFIGS:
        run(
            [
                sys.executable,
                "evaluation/run_retrieval_eval.py",
                "--user-id",
                baseline_user_id,
                "--eval-set",
                args.eval_set,
                "--top-k",
                str(args.top_k),
                "--label",
                label,
                *flags,
            ]
        )
        result = load(f"retrieval_eval_{label}.json")
        runs[label] = {
            "kind": "query",
            "flags": flags,
            "user_id": baseline_user_id,
            "retrieval_latency_ms": result["retrieval_latency_ms"],
            "queries_with_no_results": result["queries_with_no_results"],
            "metrics": headline(result["metrics"]),
        }

    baseline_metrics = runs[baseline_label]["metrics"]
    comparison = {}
    for label, entry in runs.items():
        if label == baseline_label:
            continue
        comparison[label] = {
            level: {
                metric: delta(
                    baseline_metrics[level][metric], entry["metrics"][level][metric]
                )
                for metric in ("recall_at_1", "recall_at_3", "recall_at_5", "mrr", "ndcg_at_5")
            }
            for level in ("document", "page", "answer")
        }

    save(
        args.out,
        {
            "eval_set": args.eval_set,
            "eval_set_size": len(eval_set["queries"]),
            "top_k": args.top_k,
            "baseline": baseline_label,
            "runs": runs,
            "vs_baseline": comparison,
        },
    )

    print("\n=== page-level recall@5 by configuration ===")
    for label, entry in runs.items():
        value = entry["metrics"]["page"]["recall_at_5"]
        marker = "  (baseline)" if label == baseline_label else ""
        print(f"{label:28s} {value}{marker}")


if __name__ == "__main__":
    main()
