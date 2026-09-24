"""OpenAI provider (GPT-4o, GPT-4o-mini, etc.)."""

from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

from openai import AsyncOpenAI, APIConnectionError, APIStatusError, RateLimitError as OpenAIRateLimitError

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


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        self._client = AsyncOpenAI(api_key=api_key, timeout=timeout)

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
        except OpenAIRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(f"HTTP {exc.status_code}: {exc.message}") from exc
        except TimeoutError as exc:
            raise GenerationTimeoutError(str(exc)) from exc

        choice = response.choices[0]
        if not choice.message.content:
            raise MalformedResponseError("Provider returned empty content.")

        usage = response.usage
        logger.info(
            "[openai] generate latency=%.2fs model=%s prompt_tokens=%s completion_tokens=%s",
            time.monotonic() - t0, request.model,
            usage.prompt_tokens if usage else None,
            usage.completion_tokens if usage else None,
        )
        return LLMResponse(
            answer=choice.message.content,
            citations=[],
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
        except OpenAIRateLimitError as exc:
            raise RateLimitError(str(exc)) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except GeneratorExit:
            raise StreamInterruptedError("Client disconnected during stream.")

        logger.info("[openai] stream completed latency=%.2fs", time.monotonic() - t0)

    async def health_check(self) -> bool:
        try:
            await self._client.models.list()
            return True
        except Exception:
            return False
