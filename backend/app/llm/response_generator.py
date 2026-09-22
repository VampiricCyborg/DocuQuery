"""
Response generator — orchestrates retrieval → prompt → LLM → citations.

This is the only module that knows about both the retrieval layer and the LLM layer.
No FastAPI code here.
"""

from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

from app.core.config import get_settings
from app.llm.models import (
    CHARS_PER_TOKEN,
    CitationRecord,
    HistoryMessage,
    LLMRequest,
    LLMResponse,
    StreamCapture,
)
from app.llm.prompts import get_system_prompt
from app.llm.providers.base import BaseLLMProvider
from app.llm.stream import stream_with_citations
from app.llm.exceptions import NoContextError
from app.retrieval.retrieval_pipeline import RetrievalResult

logger = logging.getLogger(__name__)

def _truncate_context(context: str, max_tokens: int) -> str:
    """Hard-truncate context to stay within the configured token budget."""
    max_chars = max_tokens * CHARS_PER_TOKEN
    if len(context) <= max_chars:
        return context
    truncated = context[:max_chars]
    logger.warning("[generator] Context truncated from %d to %d chars", len(context), max_chars)
    return truncated


def _build_citations(result: RetrievalResult) -> list[CitationRecord]:
    document_citations = [
        CitationRecord(
            document_id=c.document_id,
            filename=c.filename,
            page=c.page,
            chunk_index=c.chunk_index,
        )
        for c in result.chunks
    ]
    web_citations = [
        CitationRecord(
            document_id=f"web:{source.url}",
            filename=source.title,
            page=0,
            chunk_index=index,
            source_type="web",
            title=source.title,
            url=source.url,
        )
        for index, source in enumerate(result.web_sources)
    ]
    return document_citations + web_citations


def _build_request(
    message: str,
    context: str,
    system_prompt: str,
    model: str,
    temperature: float,
    max_tokens: int,
    history: list[HistoryMessage] | None = None,
) -> LLMRequest:
    history = history or []
    history_chars = sum(len(h.content) for h in history)
    prompt_chars = len(system_prompt) + len(context) + len(message) + history_chars
    logger.info(
        "[generator] prompt_chars=%d context_chars=%d history_turns=%d history_chars=%d",
        prompt_chars, len(context), len(history), history_chars,
    )
    return LLMRequest(
        system_prompt=system_prompt,
        user_message=message,
        context=context,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        history=history,
    )


class ResponseGenerator:
    """
    Stateless orchestrator: retrieval result → LLM response.

    Injected with a provider at construction time — no global state.
    Future phases (memory, reranking) extend this class or wrap it.
    """

    def __init__(self, provider: BaseLLMProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> BaseLLMProvider:
        """The configured provider. Used by the query condenser, which needs a
        plain one-shot completion rather than the retrieval-shaped pipeline."""
        return self._provider

    async def generate(
        self,
        message: str,
        retrieval_result: RetrievalResult,
        mode: str = "docuquery",
        history: list[HistoryMessage] | None = None,
    ) -> LLMResponse:
        """Non-streaming path — returns a complete LLMResponse with citations attached."""
        settings = get_settings()
        context, citations = self._prepare(retrieval_result, settings.llm_max_context_tokens, allow_empty=mode in ("llm", "hybrid"))

        request = _build_request(
            message=message,
            context=context,
            system_prompt=get_system_prompt(mode=mode),
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            history=history,
        )

        t0 = time.monotonic()
        response = await self._provider.generate(request)
        logger.info(
            "[generator] generate latency=%.2fs provider=%s chunks=%d",
            time.monotonic() - t0, settings.llm_provider, len(retrieval_result.chunks),
        )

        response.citations = citations
        return response

    async def stream(
        self,
        message: str,
        retrieval_result: RetrievalResult,
        mode: str = "docuquery",
        history: list[HistoryMessage] | None = None,
        capture: StreamCapture | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming path — yields SSE-framed tokens then a citations event."""
        settings = get_settings()
        context, citations = self._prepare(retrieval_result, settings.llm_max_context_tokens, allow_empty=mode in ("llm", "hybrid"))

        request = _build_request(
            message=message,
            context=context,
            system_prompt=get_system_prompt(mode=mode),
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            history=history,
        )

        t0 = time.monotonic()
        logger.info(
            "[generator] stream start provider=%s chunks=%d",
            settings.llm_provider, len(retrieval_result.chunks),
        )

        # Recorded before the first token, so a client that disconnects one token
        # in still leaves behind a partial message with its citations attached.
        if capture is not None:
            capture.citations = citations

        token_gen = self._provider.stream(request)
        async for event in stream_with_citations(token_gen, citations, capture=capture):
            yield event

        logger.info("[generator] stream end latency=%.2fs", time.monotonic() - t0)

    @staticmethod
    def _prepare(
        result: RetrievalResult, max_context_tokens: int, allow_empty: bool = False
    ) -> tuple[str, list[CitationRecord]]:
        # Guard first — before any work that depends on chunks being present
        if not result.chunks and not allow_empty:
            raise NoContextError("Retrieval returned no chunks — cannot generate answer.")
        citations = [] if allow_empty else _build_citations(result)
        context = _truncate_context(result.context, max_context_tokens)
        return context, citations
