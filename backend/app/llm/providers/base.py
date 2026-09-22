"""Abstract base class for all LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator

from app.llm.models import LLMRequest, LLMResponse


def build_user_turn(request: LLMRequest) -> str:
    """
    The live user turn: retrieved passages followed by the question.

    With no context — LLM mode, and the query condenser — the message is sent on
    its own. The older unconditional f-string produced a turn beginning
    "\\n\\nQuestion: " in exactly those cases, which is noise the model has to
    read past.
    """
    if not request.context:
        return request.user_message
    return f"{request.context}\n\nQuestion: {request.user_message}"


def build_chat_messages(request: LLMRequest) -> list[dict[str, str]]:
    """
    system prompt, prior turns, then the live user turn — OpenAI/Groq wire format.

    `request.history` is already trimmed and strictly alternating; see
    app.services.conversation_service.load_history.
    """
    messages: list[dict[str, str]] = [{"role": "system", "content": request.system_prompt}]
    messages.extend({"role": turn.role, "content": turn.content} for turn in request.history)
    messages.append({"role": "user", "content": build_user_turn(request)})
    return messages


def build_anthropic_messages(request: LLMRequest) -> list[dict[str, str]]:
    """
    Prior turns then the live user turn. No system entry: Anthropic takes the
    system prompt as a separate top-level parameter rather than a message.
    """
    messages = [{"role": turn.role, "content": turn.content} for turn in request.history]
    messages.append({"role": "user", "content": build_user_turn(request)})
    return messages


class BaseLLMProvider(ABC):
    """
    Contract every provider must satisfy.

    Swapping providers requires only a config change — no application code changes.
    """

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Return a complete response (non-streaming)."""

    @abstractmethod
    async def stream(self, request: LLMRequest) -> AsyncGenerator[str, None]:
        """Yield response tokens one at a time."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the provider is reachable."""
