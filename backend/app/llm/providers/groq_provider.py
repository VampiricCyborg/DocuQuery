"""Groq provider — default development provider."""

from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

from groq import AsyncGroq, APIConnectionError, APIStatusError, RateLimitError as GroqRateLimitError

from app.llm.providers.base import BaseLLMProvider, build_chat_messages
from app.llm.models import LLMRequest, LLMResponse
from app.llm.exceptions import (
    ProviderUnavailableError,
    RateLimitError,
    GenerationTimeoutError,
    MalformedResponseError,
    StreamInterruptedError,
)

logger = logging.getLogger(__name__)


class GroqProvider(BaseLLMProvider):
    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        self._client = AsyncGroq(api_key=api_key, timeout=timeout)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        t0 = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=request.model,
                messages=build_chat_messages(request),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=False,
            )
        except GroqRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(f"HTTP {exc.status_code}: {exc.message}") from exc
        except TimeoutError as exc:
            raise GenerationTimeoutError(str(exc)) from exc

        latency = time.monotonic() - t0
        choice = response.choices[0]
        if not choice.message.content:
            raise MalformedResponseError("Provider returned empty content.")

        usage = response.usage
        logger.info(
            "[groq] generate latency=%.2fs model=%s prompt_tokens=%s completion_tokens=%s",
            latency, request.model,
            usage.prompt_tokens if usage else None,
            usage.completion_tokens if usage else None,
        )
        return LLMResponse(
            answer=choice.message.content,
            citations=[],  # attached by response_generator
            model=request.model,
            prompt_tokens=usage.prompt_tokens if usage else None,
            completion_tokens=usage.completion_tokens if usage else None,
        )

    async def stream(self, request: LLMRequest) -> AsyncGenerator[str, None]:
        t0 = time.monotonic()
        try:
            stream = await self._client.chat.completions.create(
                model=request.model,
                messages=build_chat_messages(request),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except GroqRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(f"HTTP {exc.status_code}: {exc.message}") from exc
        except GeneratorExit:
            raise StreamInterruptedError("Client disconnected during stream.")

        logger.info("[groq] stream completed latency=%.2fs model=%s", time.monotonic() - t0, request.model)

    async def health_check(self) -> bool:
        try:
            models = await self._client.models.list()
            return len(models.data) > 0
        except Exception:
            return False
