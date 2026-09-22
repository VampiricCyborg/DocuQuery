"""Chat request/response schemas."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, model_validator


class ChatRequest(BaseModel):
    # Empty is allowed only when `regenerate` is set; see the validator below.
    message: str = Field(default="", max_length=4000)
    top_k: int | None = Field(default=None, ge=1, le=20)
    # Absent means "start a new conversation". An id that does not exist, or
    # belongs to another user, is a 404 raised before anything is streamed.
    conversation_id: str | None = None
    mode: Literal["docuquery", "llm", "hybrid"] = "docuquery"
    # Re-answer the last user message in place of the existing assistant reply,
    # rather than appending another turn. Requires `conversation_id`; the text
    # that gets re-answered is read from the server, not from this request.
    regenerate: bool = False

    @model_validator(mode="after")
    def _check_message(self) -> "ChatRequest":
        if self.regenerate:
            if not self.conversation_id:
                raise ValueError("regenerate requires conversation_id")
            return self
        if not self.message.strip():
            raise ValueError("message must not be empty")
        return self


class CitationOut(BaseModel):
    document_id: str
    filename: str
    page: int
    chunk_index: int
    source_type: Literal["document", "web"] = "document"
    title: str | None = None
    url: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    model: str
    conversation_id: str | None = None
    # The standalone query retrieval actually ran on. Equal to the user's message
    # unless the condenser rewrote a follow-up.
    retrieval_query: str | None = None
