"""Conversation and message schemas for Phase 8 (server-side chat history)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.chat import CitationOut

ChatMode = Literal["docuquery", "llm", "hybrid"]
MessageRole = Literal["user", "assistant"]
MessageStatus = Literal["complete", "partial", "error"]
Feedback = Literal["up", "down"]


# ─── Output ───────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: MessageRole
    content: str
    status: MessageStatus
    mode: ChatMode | None = None
    model: str | None = None
    citations: list[CitationOut] | None = None
    steps: list[dict] | None = None
    feedback: Feedback | None = None
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    mode: ChatMode
    pinned: bool
    created_at: datetime
    updated_at: datetime


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut]


class ConversationPage(BaseModel):
    """One page of the sidebar list. `total` is the unpaginated count."""

    items: list[ConversationOut]
    total: int
    limit: int
    offset: int
    has_more: bool


# ─── Input ────────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    mode: ChatMode = "docuquery"


class ConversationPatch(BaseModel):
    """
    Partial update. Every field is optional and `None` means "leave alone" rather
    than "set to null", so a rename cannot accidentally unpin a thread.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    pinned: bool | None = None
    mode: ChatMode | None = None


class MessageFeedbackPatch(BaseModel):
    """`feedback: null` clears an existing thumb rather than leaving it unchanged."""

    feedback: Feedback | None = None


# ─── Import (one-time localStorage migration) ─────────────────────────────────

class ImportMessage(BaseModel):
    role: MessageRole
    content: str = Field(max_length=100_000)
    status: MessageStatus = "complete"
    citations: list[CitationOut] | None = None
    feedback: Feedback | None = None
    created_at: datetime | None = None


class ImportConversation(BaseModel):
    title: str = Field(default="Imported Chat", max_length=200)
    mode: ChatMode = "docuquery"
    pinned: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[ImportMessage] = Field(default_factory=list, max_length=500)


class ConversationImportRequest(BaseModel):
    """
    The payload the browser sends once, from its legacy localStorage blob.

    The cap is enforced here rather than in the route so an oversized body is
    rejected by request validation -- a 422 before any database work happens.
    """

    conversations: list[ImportConversation] = Field(max_length=200)


class ConversationImportResult(BaseModel):
    imported: int
    skipped: int
