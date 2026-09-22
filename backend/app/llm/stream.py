"""
SSE stream utilities.

Protocol (matches the existing frontend expectations):
  - Each token:   event: token\\ndata: <JSON token text>\\n\\n
  - Citations:    event: citations\\ndata: <json>\\n\\n
  - Done:         data: [DONE]\\n\\n
  - Error:        event: error\\ndata: <message>\\n\\n
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import AsyncGenerator

from app.llm.models import CitationRecord, StreamCapture


def conversation_event(conversation_id: str) -> str:
    """
    Announces the conversation this stream belongs to.

    Emitted first, and only when /chat created the conversation itself, so a
    client that opened a brand-new chat learns its server id before any token
    arrives -- early enough to put the id in the URL without waiting for, or
    interrupting, the answer.
    """
    return f"event: conversation\ndata: {json.dumps({'id': conversation_id})}\n\n"


def token_event(token: str) -> str:
    # JSON keeps newlines and leading/trailing spaces unambiguous inside SSE.
    return f"event: token\ndata: {json.dumps(token, ensure_ascii=False)}\n\n"


def citations_event(citations: list[CitationRecord]) -> str:
    payload = json.dumps([asdict(c) for c in citations])
    return f"event: citations\ndata: {payload}\n\n"


def done_event() -> str:
    return "data: [DONE]\n\n"


def error_event(message: str) -> str:
    return f"event: error\ndata: {message}\n\n"


async def stream_with_citations(
    token_stream: AsyncGenerator[str, None],
    citations: list[CitationRecord],
    capture: StreamCapture | None = None,
) -> AsyncGenerator[str, None]:
    """
    Wrap a raw token stream with SSE framing.

    Yields token events, then a single citations event, then [DONE]. When
    `capture` is supplied each token is also recorded there, so the caller can
    persist the answer -- including a partial one, if the client disconnects
    before [DONE].
    """
    async for token in token_stream:
        if capture is not None:
            capture.tokens.append(token)
        yield token_event(token)
    yield citations_event(citations)
    yield done_event()
