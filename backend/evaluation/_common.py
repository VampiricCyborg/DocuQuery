"""
Shared plumbing for the evaluation harness.

Everything here exists so the individual scripts stay short and so that the
evaluation talks to the *real* application code -- the same parser, cleaner,
chunker, embedding service, and retrieval pipeline the API uses. Nothing is
reimplemented for measurement purposes.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Make `app.*` importable when this file is run from backend/evaluation/.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


def eval_database_url() -> str:
    """
    The database the harness measures against.

    Defaults to the application's own DATABASE_URL so the evaluation runs
    against the same schema the app runs against. Override with
    EVAL_DATABASE_URL to point at a throwaway database instead.
    """
    from app.core.config import get_settings

    override = os.getenv("EVAL_DATABASE_URL")
    if override:
        return override.replace("postgresql://", "postgresql+asyncpg://", 1)
    return get_settings().async_database_url


def config_id(**parts: Any) -> str:
    """
    A short, stable id for a configuration.

    Used as the synthetic `user_id` under which a configuration's documents are
    ingested, which makes the retrieval pipeline's existing per-user filter do
    the isolation between configurations for us -- no extra schema, and the
    isolation path being exercised is the production one.
    """
    blob = json.dumps(parts, sort_keys=True, separators=(",", ":"))
    return "eval-" + hashlib.sha256(blob.encode()).hexdigest()[:16]


def environment() -> dict:
    """Machine and version facts, recorded alongside every result file."""
    import numpy

    env = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "processor": platform.processor(),
        "python": sys.version.split()[0],
        "cpu_count_logical": os.cpu_count(),
        "numpy": numpy.__version__,
    }

    try:
        import psutil

        env["cpu_count_physical"] = psutil.cpu_count(logical=False)
        env["total_ram_gb"] = round(psutil.virtual_memory().total / 1024**3, 2)
    except ImportError:
        pass

    try:
        import onnxruntime

        env["onnxruntime"] = onnxruntime.__version__
    except ImportError:
        pass

    try:
        env["git_commit"] = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=BACKEND_ROOT, text=True
        ).strip()
        env["git_dirty"] = bool(
            subprocess.check_output(
                ["git", "status", "--porcelain"], cwd=BACKEND_ROOT, text=True
            ).strip()
        )
    except Exception:
        pass

    return env


def _plain(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _plain(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def save(name: str, payload: dict) -> Path:
    """Write a result file, always stamped with the environment it came from."""
    out = RESULTS_DIR / name
    body = {"environment": environment(), **_plain(payload)}
    out.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[saved] {out}")
    return out


def load(name: str) -> dict:
    return json.loads((RESULTS_DIR / name).read_text(encoding="utf-8"))


def percentiles(values: list[float], points: tuple[int, ...] = (50, 95, 99)) -> dict:
    """
    Nearest-rank percentiles.

    Deliberately not interpolated: with the sample sizes this harness produces,
    an interpolated P99 is a number no single run actually exhibited.
    """
    if not values:
        return {f"p{p}": None for p in points} | {"min": None, "max": None, "mean": None, "n": 0}

    ordered = sorted(values)
    result: dict[str, float | int | None] = {}
    for p in points:
        rank = max(1, -(-p * len(ordered) // 100))  # ceil(p/100 * n)
        result[f"p{p}"] = round(ordered[rank - 1], 3)
    result["min"] = round(ordered[0], 3)
    result["max"] = round(ordered[-1], 3)
    result["mean"] = round(sum(ordered) / len(ordered), 3)
    result["n"] = len(ordered)
    return result
