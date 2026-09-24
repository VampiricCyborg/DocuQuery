"""Internal data models for the LLM layer."""

from __future__ import annotations

from dataclasses import dataclass, field

# Rough chars-per-token estimate used for every token budget in this layer.
# Accurate enough for English prose; avoids a full tokeniser dependency. Shared
# so the history budget and the context budget measure in the same unit.
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    return len(text) // CHARS_PER_TOKEN


@dataclass
class HistoryMessage:
    """One earlier turn replayed to the provider. `role` is "user" or "assistant"."""

    role: str
    content: str


@dataclass
class LLMRequest:
    """Everything a provider needs to generate a response."""
    system_prompt: str
    user_message: str
    context: str
    model: str
    temperature: float
    max_tokens: int
    # Prior turns, oldest first, already trimmed to the history budget by the
    # caller. Empty for the first message of a conversation.
    history: list[HistoryMessage] = field(default_factory=list)


@dataclass
class CitationRecord:
    document_id: str
    filename: str
    page: int
    chunk_index: int
    source_type: str = "document"
    title: str | None = None
    url: str | None = None


@dataclass
class LLMResponse:
    """Structured response returned by response_generator."""
    answer: str
    citations: list[CitationRecord]
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


@dataclass
class StreamCapture:
    """
    Collects what a stream produced, so the caller can persist it.

    The streaming path yields SSE frames, not raw text. Without this the route
    would have to parse its own wire format back into an answer in order to save
    it -- and it has to save it even when the client hangs up mid-answer, which is
    exactly when `tokens` holds a partial reply.
    """

    tokens: list[str] = field(default_factory=list)
    citations: list[CitationRecord] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(self.tokens)
