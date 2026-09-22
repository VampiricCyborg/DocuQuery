"""
Conversation CRUD.

Thin by design: every handler validates, calls one service function, and turns a
`None` or `False` result into 404.

On 404 vs 403 — a conversation that belongs to another user answers exactly like
one that does not exist. Returning 403 would confirm that the id is real and
someone else's, which is a membership oracle: an attacker could enumerate valid
conversation ids without ever reading one. The service layer makes this the
default by folding `user_id` into every WHERE clause, so a handler cannot forget.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.database.models import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationDetailOut,
    ConversationImportRequest,
    ConversationImportResult,
    ConversationOut,
    ConversationPage,
    ConversationPatch,
    MessageFeedbackPatch,
    MessageOut,
)
from app.services import conversation_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["Conversations"])

_NOT_FOUND = "Conversation not found."


@router.get("", response_model=ConversationPage)
async def list_conversations(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One page of the signed-in user's conversations, pinned first."""
    items, total = await conversation_service.list_conversations(
        db, current_user.id, limit=limit, offset=offset
    )
    return ConversationPage(
        items=[ConversationOut.model_validate(c) for c in items],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(items) < total,
    )


@router.post("/import", response_model=ConversationImportResult)
async def import_conversations(
    payload: ConversationImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    One-time migration of chats that were saved in the browser's localStorage.

    Declared before `/{conversation_id}` so the literal path wins the match. The
    200-conversation cap lives in the request schema, which means an oversized
    body is rejected by validation before any database work starts.

    Deliberately not idempotent: the client deletes its legacy key only after a
    2xx, and calling this twice with the same payload duplicates the threads.
    """
    imported, skipped = await conversation_service.import_conversations(
        db, current_user.id, payload.conversations
    )
    return ConversationImportResult(imported=imported, skipped=skipped)


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await conversation_service.create_conversation(
        db, current_user.id, title=payload.title, mode=payload.mode
    )
    return ConversationOut.model_validate(conversation)


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The conversation and every message in it, oldest first."""
    conversation = await conversation_service.get_conversation_with_messages(
        db, current_user.id, conversation_id
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return ConversationDetailOut.model_validate(conversation)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def patch_conversation(
    conversation_id: str,
    payload: ConversationPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename, pin/unpin, or switch mode. Unset fields are left alone."""
    conversation = await conversation_service.update_conversation(
        db, current_user.id, conversation_id, payload
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return ConversationOut.model_validate(conversation)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and its messages (ON DELETE CASCADE)."""
    deleted = await conversation_service.delete_conversation(
        db, current_user.id, conversation_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/{conversation_id}/messages/{message_id}/feedback", response_model=MessageOut
)
async def patch_message_feedback(
    conversation_id: str,
    message_id: str,
    payload: MessageFeedbackPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set or clear the thumb on one message. `{"feedback": null}` clears it."""
    message = await conversation_service.set_message_feedback(
        db, current_user.id, conversation_id, message_id, payload.feedback
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    return MessageOut.model_validate(message)
