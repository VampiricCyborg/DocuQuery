"""
Persistence for conversations and their messages.

Every read and write here is scoped to a user id. The routes never filter on
ownership themselves -- they pass `user_id` in and translate a `None` result into
404. That keeps the ownership rule in one place, and makes "not yours" and "does
not exist" indistinguishable from outside, which is the intended behaviour: a 403
would confirm that somebody else's conversation id is real.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import Conversation, Message
from app.llm.models import HistoryMessage, estimate_tokens
from app.schemas.conversation import ConversationPatch, ImportConversation

logger = logging.getLogger(__name__)

TITLE_MAX_CHARS = 60
DEFAULT_TITLE = "New Chat"

# Assistant rows in these states are replayed as history. `error` rows are not:
# their content is whatever happened to arrive before the failure, and feeding a
# truncated answer back as if it were a real reply teaches the model to produce
# more of the same.
_HISTORY_STATUSES = ("complete", "partial")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def title_from_message(content: str) -> str:
    """The conversation title is just the first user message, trimmed. No LLM call."""
    flat = " ".join(content.split())
    if not flat:
        return DEFAULT_TITLE
    if len(flat) <= TITLE_MAX_CHARS:
        return flat
    return flat[: TITLE_MAX_CHARS - 1].rstrip() + "…"


# --- Conversations ----------------------------------------------------------

async def list_conversations(
    db: AsyncSession, user_id: str, *, limit: int = 30, offset: int = 0
) -> tuple[list[Conversation], int]:
    """One page of a user's conversations, pinned first then most recently updated."""
    total = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == user_id)
    )
    rows = await db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows), int(total or 0)


async def create_conversation(
    db: AsyncSession, user_id: str, *, title: str | None = None, mode: str = "docuquery"
) -> Conversation:
    conversation = Conversation(
        user_id=user_id, title=title or DEFAULT_TITLE, mode=mode, pinned=False
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def get_conversation(
    db: AsyncSession, user_id: str, conversation_id: str
) -> Conversation | None:
    """The conversation, or None when it does not exist *or* belongs to someone else."""
    return await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )


async def get_conversation_with_messages(
    db: AsyncSession, user_id: str, conversation_id: str
) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )


async def update_conversation(
    db: AsyncSession, user_id: str, conversation_id: str, patch: ConversationPatch
) -> Conversation | None:
    conversation = await get_conversation(db, user_id, conversation_id)
    if conversation is None:
        return None

    # `exclude_unset` so a body of {"title": "x"} cannot also write pinned=None.
    for field, value in patch.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(conversation, field, value)

    await db.commit()
    await db.refresh(conversation)
    return conversation


async def delete_conversation(db: AsyncSession, user_id: str, conversation_id: str) -> bool:
    """True if a row was deleted. Messages go with it via ON DELETE CASCADE."""
    result = await db.execute(
        delete(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    await db.commit()
    return result.rowcount > 0


# --- Messages ---------------------------------------------------------------

async def append_message(
    db: AsyncSession,
    conversation: Conversation,
    *,
    role: str,
    content: str,
    status: str = "complete",
    mode: str | None = None,
    model: str | None = None,
    citations: list | None = None,
    steps: list | None = None,
) -> Message:
    """
    Add a message and bump the thread's `updated_at`.

    The bump is explicit: `onupdate` fires only when a column of `conversations` is
    itself written, and inserting into `messages` does not touch that row. The
    sidebar orders on `updated_at`, so without this a busy thread would sink.
    """
    message = Message(
        conversation_id=conversation.id,
        role=role,
        content=content,
        status=status,
        mode=mode,
        model=model,
        citations=citations,
        steps=steps,
    )
    db.add(message)

    conversation.updated_at = _now()
    if role == "user" and conversation.title == DEFAULT_TITLE:
        conversation.title = title_from_message(content)

    await db.commit()
    await db.refresh(message)
    return message


async def set_message_feedback(
    db: AsyncSession, user_id: str, conversation_id: str, message_id: str, feedback: str | None
) -> Message | None:
    """
    Set or clear a thumb on one message.

    The join to `conversations` is what enforces ownership: a message id alone says
    nothing about who owns it.
    """
    message = await db.scalar(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    if message is None:
        return None

    message.feedback = feedback
    await db.commit()
    await db.refresh(message)
    return message


async def delete_message(db: AsyncSession, conversation_id: str, message_id: str) -> None:
    """Remove one message. Used by retry, which regenerates the last assistant reply."""
    await db.execute(
        delete(Message).where(
            Message.id == message_id, Message.conversation_id == conversation_id
        )
    )
    await db.commit()


async def last_message(db: AsyncSession, conversation_id: str, role: str) -> Message | None:
    return await db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.role == role)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
    )


# --- History ----------------------------------------------------------------

def _pair_into_turns(messages: list[Message]) -> list[tuple[Message, Message]]:
    """
    Group an oldest-first message list into (user, assistant) turns.

    Only complete pairs survive. A user message whose answer failed, or an assistant
    message with no user message before it, is dropped rather than replayed alone --
    partly because a half turn is poor context, and partly because Anthropic's
    Messages API rejects a history that does not strictly alternate roles, so an
    unpaired message would break one provider and not the others.
    """
    turns: list[tuple[Message, Message]] = []
    pending: Message | None = None
    for message in messages:
        if message.role == "user":
            pending = message
        elif pending is not None:
            turns.append((pending, message))
            pending = None
    return turns


async def load_history(
    db: AsyncSession,
    conversation_id: str,
    *,
    turns: int,
    max_tokens: int,
    exclude_message_id: str | None = None,
) -> list[HistoryMessage]:
    """
    The last `turns` complete exchanges, oldest first, trimmed to `max_tokens`.

    `exclude_message_id` keeps the message currently being answered out of its own
    history: it is already persisted by the time this runs, and it is handed to the
    provider separately as the live user message.

    The budget is applied by dropping whole turns from the oldest end. Cutting
    mid-turn would leave a question without its answer, or an answer with no
    question.
    """
    if turns <= 0 or max_tokens <= 0:
        return []

    # Fetch newest-first under a bounded LIMIT, then reverse. Ordering by id as a
    # tiebreaker keeps the sequence stable when two rows share a timestamp.
    query = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.content != "",
            Message.status.in_(_HISTORY_STATUSES),
        )
        .order_by(Message.created_at.desc(), Message.id.desc())
        # +2 so that an excluded message cannot cost us a whole turn.
        .limit(turns * 2 + 2)
    )
    if exclude_message_id is not None:
        query = query.where(Message.id != exclude_message_id)

    rows = list(await db.scalars(query))
    rows.reverse()

    recent = _pair_into_turns(rows)[-turns:]

    # Drop whole turns from the oldest end until the budget is met.
    while recent:
        used = sum(
            estimate_tokens(user.content) + estimate_tokens(assistant.content)
            for user, assistant in recent
        )
        if used <= max_tokens:
            break
        recent.pop(0)

    history: list[HistoryMessage] = []
    for user, assistant in recent:
        history.append(HistoryMessage(role="user", content=user.content))
        history.append(HistoryMessage(role="assistant", content=assistant.content))
    return history


# --- One-time import from localStorage --------------------------------------

async def import_conversations(
    db: AsyncSession, user_id: str, payload: list[ImportConversation]
) -> tuple[int, int]:
    """
    Bulk-insert conversations exported from the browser's legacy localStorage key.

    Returns (imported, skipped). A conversation with no messages is skipped: the old
    store created a row the moment "New Chat" was clicked, so a long-lived browser
    accumulates empty threads nobody wants restored.

    Client timestamps are trusted only for ordering. They are user-writable data, so
    nothing security-relevant hangs off them; the worst a forged value does is
    misplace a row in the caller's own sidebar.
    """
    imported = 0
    skipped = 0

    for incoming in payload:
        if not incoming.messages:
            skipped += 1
            continue

        created = incoming.created_at or _now()
        conversation = Conversation(
            user_id=user_id,
            title=incoming.title or DEFAULT_TITLE,
            mode=incoming.mode,
            pinned=incoming.pinned,
            created_at=created,
            updated_at=incoming.updated_at or created,
        )
        db.add(conversation)
        await db.flush()

        for order, message in enumerate(incoming.messages):
            db.add(
                Message(
                    conversation_id=conversation.id,
                    role=message.role,
                    content=message.content,
                    status=message.status,
                    mode=incoming.mode,
                    citations=(
                        [c.model_dump() for c in message.citations]
                        if message.citations
                        else None
                    ),
                    feedback=message.feedback,
                    # Messages the old store never timestamped would otherwise all
                    # land on the same instant and come back in arbitrary order.
                    # Spacing them by their position preserves the thread.
                    created_at=message.created_at or created + timedelta(milliseconds=order),
                )
            )
        imported += 1

    await db.commit()
    logger.info("[conversations] imported=%d skipped=%d user=%s", imported, skipped, user_id)
    return imported, skipped
