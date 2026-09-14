"""
Embedding service — ONNX Runtime + BAAI/bge-small-en-v1.5 (INT8, CLS-pooled).

No PyTorch, no sentence-transformers, anywhere in this module. That's
deliberate: importing sentence-transformers (which pulls in torch) was
enough on its own to exceed Railway Free's memory ceiling and get the
process SIGKILLed before startup ever completed. onnxruntime + a raw
tokenizer have a much smaller import/runtime footprint.

Pooling: BGE models use CLS-token pooling (the first token of
last_hidden_state), NOT mean pooling -- confirmed against BAAI's own
1_Pooling/config.json (pooling_mode_cls_token: true, all others false).
Followed by L2 normalization, matching BGE's documented usage.

Query and document embeddings go through this exact same code path --
no query-instruction prefix is added, matching the symmetry the rest of
the RAG pipeline (cosine similarity over normalized vectors) expects.
"""

import logging
import os
from pathlib import Path
from typing import ClassVar

import numpy as np

from app.core.config import get_settings

logger = logging.getLogger(__name__)

MAX_SEQ_LENGTH = 512


class EmbeddingService:
    _instance: ClassVar["EmbeddingService | None"] = None
    _session = None
    _tokenizer = None
    _input_names: ClassVar[set[str]] = set()

    def __new__(cls) -> "EmbeddingService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def warm_up(self) -> None:
        """Load the ONNX session + tokenizer. Idempotent."""
        if self._session is not None:
            return

        settings = get_settings()
        model_dir = Path(settings.embedding_model_dir)
        onnx_path = model_dir / "model.onnx"
        tokenizer_path = model_dir / "tokenizer.json"

        if not onnx_path.exists() or not tokenizer_path.exists():
            raise RuntimeError(
                f"Embedding model assets not found in {model_dir}. "
                "Run scripts/download_embedding_model.py first."
            )

        try:
            import psutil
            process = psutil.Process(os.getpid())
            mem_before_mb = process.memory_info().rss / (1024 * 1024)
            logger.info("[embeddings] Memory before model load: %.1f MB", mem_before_mb)
        except ImportError:
            process = None
            mem_before_mb = None

        logger.info(
            "[embeddings] Loading ONNX embedding model: %s (%s)",
            settings.embedding_model, onnx_path,
        )

        import onnxruntime as ort
        from tokenizers import Tokenizer

        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self._session = ort.InferenceSession(
            str(onnx_path), sess_options=so, providers=["CPUExecutionProvider"]
        )
        self._input_names = {inp.name for inp in self._session.get_inputs()}

        self._tokenizer = Tokenizer.from_file(str(tokenizer_path))
        self._tokenizer.enable_padding()
        self._tokenizer.enable_truncation(max_length=MAX_SEQ_LENGTH)

        if mem_before_mb is not None and process is not None:
            mem_after_mb = process.memory_info().rss / (1024 * 1024)
            logger.info(
                "[embeddings] Memory after model load: %.1f MB (delta: +%.1f MB)",
                mem_after_mb, mem_after_mb - mem_before_mb,
            )

        logger.info("[embeddings] ONNX embedding model loaded. input_names=%s", self._input_names)

    def _embed_batch(self, texts: list[str]) -> np.ndarray:
        encodings = self._tokenizer.encode_batch(texts)

        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

        feed: dict[str, np.ndarray] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }
        if "token_type_ids" in self._input_names:
            feed["token_type_ids"] = np.zeros_like(input_ids)

        outputs = self._session.run(None, feed)
        last_hidden_state = outputs[0]  # [batch, seq_len, hidden_dim]

        # BGE pooling: CLS token (first position), not mean pooling.
        cls_embeddings = last_hidden_state[:, 0, :]

        norms = np.linalg.norm(cls_embeddings, axis=1, keepdims=True)
        norms = np.clip(norms, a_min=1e-12, a_max=None)
        return cls_embeddings / norms

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of strings. Returns list of float vectors."""
        self.warm_up()
        settings = get_settings()
        batch_size = settings.embedding_batch_size

        all_vectors: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            vectors = self._embed_batch(batch)
            all_vectors.extend(vectors.astype(np.float32).tolist())
        return all_vectors


def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()
