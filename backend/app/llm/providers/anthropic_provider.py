"""Anthropic provider (Claude 3.5 Sonnet, Claude 3 Haiku, etc.)."""

from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

import anthropic
from anthropic import AsyncAnthropic, APIConnectionError, APIStatusError, RateLimitError as AnthropicRateLimitError

from app.llm.providers.base import BaseLLMProvider, build_anthropic_messages
from app.llm.models import LLMRequest, LLMResponse
from app.llm.exceptions import (
    ProviderUnavailableError,
    RateLimitError,
    GenerationTimeoutError,
    MalformedResponseError,
    StreamInterruptedError,
)

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        self._client = AsyncAnthropic(api_key=api_key, timeout=timeout)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        t0 = time.monotonic()
        try:
            response = await self._client.messages.create(
                model=request.model,
                system=request.system_prompt,
                messages=build_anthropic_messages(request),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except AnthropicRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(f"HTTP {exc.status_code}: {exc.message}") from exc
        except TimeoutError as exc:
            raise GenerationTimeoutError(str(exc)) from exc

        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        if not text_blocks:
            raise MalformedResponseError("Anthropic returned no text content.")

        answer = "".join(text_blocks)
        usage = response.usage
        logger.info(
            "[anthropic] generate latency=%.2fs model=%s input_tokens=%s output_tokens=%s",
            time.monotonic() - t0, request.model, usage.input_tokens, usage.output_tokens,
        )
        return LLMResponse(
            answer=answer,
            citations=[],
            model=request.model,
            prompt_tokens=usage.input_tokens,
            completion_tokens=usage.output_tokens,
        )

    async def stream(self, request: LLMRequest) -> AsyncGenerator[str, None]:
        t0 = time.monotonic()
        try:
            async with self._client.messages.stream(
                model=request.model,
                system=request.system_prompt,
                messages=build_anthropic_messages(request),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except AnthropicRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except GeneratorExit:
            raise StreamInterruptedError("Client disconnected during stream.")

        logger.info("[anthropic] stream completed latency=%.2fs", time.monotonic() - t0)

    async def health_check(self) -> bool:
        # Anthropic has no public list-models endpoint; attempt a minimal call
        try:
            await self._client.messages.create(
                model="claude-3-haiku-20240307",
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            return True
        except Exception:
            return False
