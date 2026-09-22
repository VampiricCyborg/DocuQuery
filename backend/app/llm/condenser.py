"""
Query condensing: rewrite an elliptical follow-up into a standalone search query.

"How does it differ from the policy engine?" embeds to almost nothing useful,
because the subject of the sentence is in the previous turn. Retrieval on that raw
text is the single largest source of bad follow-up answers.

The rewrite feeds RETRIEVAL ONLY. The user's original message is what reaches the
answer prompt, so the assistant never responds to a question the user did not ask
and a bad rewrite degrades the passages rather than changing the question.

Failure is never fatal here. Condensing sits in front of retrieval, so its latency
is added to every follow-up's time-to-first-token; on timeout or any provider
error the raw message is used instead. A worse query beats a failed request.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from app.core.config import get_settings
from app.llm.exceptions import LLMError
from app.llm.models import HistoryMessage, LLMRequest
from app.llm.prompts import (
    DEFAULT_CONDENSE_PROMPT_VERSION,
    build_condense_user_message,
    get_condense_prompt,
)
from app.llm.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)

# A standalone rewrite of a chat message is a sentence, not a paragraph. Anything
# longer means the model ignored the instruction and started answering, so the
# result is discarded rather than embedded.
MAX_REWRITE_CHARS = 400


@dataclass
class CondenseResult:
    """What retrieval should run on, and how it was arrived at."""

    query: str
    rewritten: bool
    latency_ms: float
    # "ok" | "timeout" | "provider_error" | "rejected" | "skipped"
    outcome: str


def _clean(raw: str) -> str:
    """
    Reduce the model's reply to a single query string.

    Models sometimes prefix a rewrite with "Standalone query:" or wrap it in
    quotes despite the instruction not to; the first non-empty line, unquoted, is
    the rewrite in every one of those shapes.
    """
    for line in raw.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        for prefix in ("standalone search query:", "standalone query:", "query:", "rewrite:"):
            if candidate.lower().startswith(prefix):
                candidate = candidate[len(prefix):].strip()
        candidate = candidate.strip("\"'").strip()
        if candidate:
            return candidate
    return ""


async def condense_query(
    provider: BaseLLMProvider,
    message: str,
    history: list[HistoryMessage],
    *,
    version: str = DEFAULT_CONDENSE_PROMPT_VERSION,
) -> CondenseResult:
    """
    One LLM call that turns `message` into a standalone query given `history`.

    Returns the raw message unchanged whenever there is no history, condensing is
    disabled, the call times out, the provider errors, or the reply does not look
    like a query. The caller does not need to handle failure.
    """
    settings = get_settings()

    if not history or not settings.chat_condense_enabled:
        return CondenseResult(query=message, rewritten=False, latency_ms=0.0, outcome="skipped")

    request = LLMRequest(
        system_prompt=get_condense_prompt(version),
        user_message=build_condense_user_message(history, message),
        context="",
        model=settings.llm_model,
        # Deterministic: the same follow-up should condense the same way twice, or
        # an evaluation of this step measures sampling noise.
        temperature=0.0,
        max_tokens=settings.chat_condense_max_tokens,
    )

    t0 = time.perf_counter()
    try:
        response = await asyncio.wait_for(
            provider.generate(request), timeout=settings.chat_condense_timeout
        )
    except (asyncio.TimeoutError, TimeoutError):
        elapsed = (time.perf_counter() - t0) * 1000
        logger.warning(
            "[condense] timeout after %.0fms — retrieving on the raw message | raw=%r",
            elapsed, message,
        )
        return CondenseResult(query=message, rewritten=False, latency_ms=elapsed, outcome="timeout")
    except LLMError as exc:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.warning(
            "[condense] provider error (%s) — retrieving on the raw message | raw=%r",
            exc.__class__.__name__, message,
        )
        return CondenseResult(
            query=message, rewritten=False, latency_ms=elapsed, outcome="provider_error"
        )

    elapsed = (time.perf_counter() - t0) * 1000
    rewrite = _clean(response.answer or "")

    if not rewrite or len(rewrite) > MAX_REWRITE_CHARS:
        logger.warning(
            "[condense] unusable rewrite (%d chars) — retrieving on the raw message | raw=%r",
            len(rewrite), message,
        )
        return CondenseResult(
            query=message, rewritten=False, latency_ms=elapsed, outcome="rejected"
        )

    # Both sides are logged deliberately: a follow-up that retrieves badly is
    # almost always diagnosed by comparing what the user typed with what was
    # actually searched for.
    logger.info(
        "[condense] %.0fms | raw=%r -> rewritten=%r", elapsed, message, rewrite
    )
    return CondenseResult(query=rewrite, rewritten=True, latency_ms=elapsed, outcome="ok")
