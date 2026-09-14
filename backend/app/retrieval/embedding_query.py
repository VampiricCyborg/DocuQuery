"""
Query embedding — reuses the ingestion EmbeddingService singleton.
Provides an async-friendly interface for the retrieval pipeline.
"""

import asyncio
import logging
import time

from app.ingestion.embeddings import get_embedding_service
from app.retrieval.exceptions import EmbeddingError

logger = logging.getLogger(__name__)


async def embed_query(query: str) -> list[float]:
    """
    Embed a single query string.
    Runs the CPU-bound encode in a thread pool to avoid blocking the event loop.
    Returns a normalised 384-dim vector.
    """
    if not query or not query.strip():
        raise EmbeddingError("Query must be a non-empty string.")

    try:
        t0 = time.perf_counter()
        loop = asyncio.get_running_loop()
        service = get_embedding_service()
        # encode is CPU-bound — offload to default thread pool
        vectors: list[list[float]] = await loop.run_in_executor(
            None, lambda: service.embed([query.strip()])
        )
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.info("[retrieval] Query embedded in %.1f ms", latency_ms)
        return vectors[0]
    except EmbeddingError:
        raise
    except Exception as exc:
        raise EmbeddingError(f"Embedding generation failed: {exc}") from exc
