"""
Ollama provider — local inference, no API key required.

Talks to `/api/chat`, not `/api/generate`. `/api/generate` accepts a single prompt
string and has nowhere to put prior turns, so conversation history had to be
flattened into the prompt and the model could not tell its own past replies from
the user's questions. `/api/chat` takes the same `messages` list shape the hosted
providers use.
"""

from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

import httpx

from app.llm.providers.base import BaseLLMProvider, build_chat_messages
from app.llm.models import LLMRequest, LLMResponse
from app.llm.exceptions import (
    ProviderUnavailableError,
    GenerationTimeoutError,
    MalformedResponseError,
    StreamInterruptedError,
)

logger = logging.getLogger(__name__)


class OllamaProvider(BaseLLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434", timeout: float = 60.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def _payload(self, request: LLMRequest, *, stream: bool) -> dict:
        return {
            "model": request.model,
            "messages": build_chat_messages(request),
            "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
            "stream": stream,
        }

    async def generate(self, request: LLMRequest) -> LLMResponse:
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base_url}/api/chat", json=self._payload(request, stream=False)
                )
                resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise GenerationTimeoutError(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(str(exc)) from exc

        data = resp.json()
        answer = (data.get("message") or {}).get("content", "")
        if not answer:
            raise MalformedResponseError("Ollama returned empty response.")

        logger.info("[ollama] generate latency=%.2fs model=%s", time.monotonic() - t0, request.model)
        return LLMResponse(
            answer=answer,
            citations=[],
            model=request.model,
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
        )

    async def stream(self, request: LLMRequest) -> AsyncGenerator[str, None]:
        import json
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST", f"{self._base_url}/api/chat", json=self._payload(request, stream=True)
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        token = (data.get("message") or {}).get("content", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
        except httpx.TimeoutException as exc:
            raise GenerationTimeoutError(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(str(exc)) from exc
        except GeneratorExit:
            raise StreamInterruptedError("Client disconnected during stream.")

        logger.info("[ollama] stream completed latency=%.2fs", time.monotonic() - t0)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
