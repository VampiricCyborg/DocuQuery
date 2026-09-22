"""
POST /chat — RAG chat endpoint.

Pipeline:
  1. Resolve (or create) the conversation and persist the user message
  2. Load recent history under its own token budget
  3. Condense an elliptical follow-up into a standalone retrieval query
  4. Run the retrieval pipeline
  5. Pass RetrievalResult + history to ResponseGenerator
  6. Stream SSE tokens + citations, then persist the assistant message

No prompt logic here — all business logic lives in app/llm/ and app/services/.
"""

import asyncio
import logging
from dataclasses import asdict
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.database.models import Conversation, User
from app.database.session import AsyncSessionLocal
from app.schemas.chat import ChatRequest, ChatResponse, CitationOut
from app.retrieval.retrieval_pipeline import RetrievalResult
from app.retrieval import run_retrieval_pipeline
from app.retrieval.exceptions import NoResultsError, EmbeddingError, VectorSearchError
from app.llm import get_response_generator
from app.llm.condenser import condense_query
from app.llm.models import StreamCapture
from app.llm.stream import conversation_event
from app.llm.exceptions import (
    NoContextError,
    ProviderUnavailableError,
    RateLimitError,
    GenerationTimeoutError,
    MalformedResponseError,
)
from app.core.config import get_settings
from app.core.middleware import limiter
from app.services import conversation_service
from app.web_search import build_web_context, search_web

logger = logging.getLogger(__name__)
router = APIRouter()

_NO_RESULTS_ANSWER = "I could not find relevant information in the available documents."

# asyncio holds only weak references to tasks, so a fire-and-forget write can be
# garbage-collected mid-flight. Anything still writing is kept here until it is done.
_pending_writes: set[asyncio.Task] = set()


async def _save_assistant_message(
    conversation_id: str,
    *,
    content: str,
    status: str,
    mode: str,
    model: str,
    citations: list | None,
) -> None:
    """
    Write the assistant's reply using a session of its own.

    A fresh session from the sessionmaker, deliberately: this runs from the
    streaming generator's `finally`, which on a client disconnect executes while
    the request is being torn down. The request-scoped session that `get_db`
    yielded is closed by then, and reusing it raises rather than saving the
    partial answer the user actually saw.
    """
    async with AsyncSessionLocal() as session:
        conversation = await session.get(Conversation, conversation_id)
        if conversation is None:
            # Deleted while the answer was still streaming. Nothing to attach to.
            logger.info("[chat] conversation %s vanished mid-stream", conversation_id)
            return
        await conversation_service.append_message(
            session,
            conversation,
            role="assistant",
            content=content,
            status=status,
            mode=mode,
            model=model,
            citations=citations,
        )


def _persist_in_background(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _pending_writes.add(task)
    task.add_done_callback(_pending_writes.discard)
    return task


@router.post("/chat")
@limiter.limit(lambda: get_settings().rate_limit_chat)
async def chat(
    request: Request,
    chat_request: Annotated[ChatRequest, Body(...)],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Streaming RAG chat with conversation memory.

    Returns text/event-stream when streaming is enabled, or a JSON ChatResponse
    when it is disabled.
    """
    settings = get_settings()

    # --- 1. Conversation ------------------------------------------------------
    # Resolved before a single byte is streamed: once StreamingResponse has been
    # returned the status code is already 200, and a "conversation not found"
    # would have to be reported as an SSE error event the client cannot tell from
    # a provider outage.
    created = False
    if chat_request.conversation_id:
        conversation = await conversation_service.get_conversation(
            db, current_user.id, chat_request.conversation_id
        )
        if conversation is None:
            # 404 rather than 403 for another user's id -- see app/api/conversations.py.
            raise HTTPException(status_code=404, detail="Conversation not found.")
    else:
        conversation = await conversation_service.create_conversation(
            db, current_user.id, mode=chat_request.mode
        )
        created = True

    # --- 2. The message being answered ---------------------------------------
    if chat_request.regenerate:
        # Retry re-answers the question already on record and replaces the stale
        # reply, so the thread does not grow a duplicate turn every time the user
        # is unhappy with an answer. The text comes from the database, not the
        # request, so a retry cannot quietly change the question.
        last_user = await conversation_service.last_message(db, conversation.id, "user")
        if last_user is None:
            raise HTTPException(status_code=409, detail="This conversation has nothing to retry.")
        message_text = last_user.content
        user_message_id = last_user.id

        stale = await conversation_service.last_message(db, conversation.id, "assistant")
        if stale is not None:
            await conversation_service.delete_message(db, conversation.id, stale.id)
    else:
        message_text = chat_request.message
        user_message = await conversation_service.append_message(
            db, conversation, role="user", content=message_text, mode=chat_request.mode
        )
        user_message_id = user_message.id

    # --- 3. History -----------------------------------------------------------
    history = await conversation_service.load_history(
        db,
        conversation.id,
        turns=settings.chat_history_turns,
        max_tokens=settings.chat_history_max_tokens,
        exclude_message_id=user_message_id,
    )

    generator = get_response_generator()

    # --- 4. Query condensing --------------------------------------------------
    # LLM mode never retrieves, so there is nothing to condense for. Everything
    # else rewrites the follow-up into a standalone query -- for RETRIEVAL ONLY.
    retrieval_query = message_text
    if history and chat_request.mode != "llm":
        condensed = await condense_query(generator.provider, message_text, history)
        retrieval_query = condensed.query

    if retrieval_query != message_text:
        logger.info(
            "[chat] conversation=%s retrieval_query=%r original=%r",
            conversation.id, retrieval_query, message_text,
        )

    # --- 5. Retrieval ---------------------------------------------------------
    # LLM mode intentionally skips retrieval. DocuQuery and Hybrid use the
    # same grounded retrieval pipeline, while Hybrid's prompt also allows
    # general reasoning beyond the retrieved excerpts.
    no_results = False
    if chat_request.mode == "llm":
        retrieval_result = RetrievalResult(
            query=message_text, chunks=[], context="", citations=[], total_retrieved=0
        )
    else:
        try:
            retrieval_result = await run_retrieval_pipeline(
                query=retrieval_query,
                db=db,
                user_id=current_user.id,
                top_k=chat_request.top_k,
                filters=None,
            )
        except (EmbeddingError, VectorSearchError) as exc:
            logger.error("[chat] Retrieval error: %s", exc)
            raise HTTPException(status_code=503, detail="Retrieval service unavailable.")
        except NoResultsError:
            retrieval_result = RetrievalResult(
                query=retrieval_query, chunks=[], context="", citations=[], total_retrieved=0
            )
            # Hybrid answers from general knowledge when nothing was retrieved;
            # DocuQuery says so instead of guessing.
            no_results = chat_request.mode != "hybrid"

    if chat_request.mode == "hybrid":
        web_sources = await search_web(retrieval_query)
        web_context = build_web_context(web_sources)
        if web_context:
            retrieval_result.context = f"{retrieval_result.context}\n\n{web_context}".strip()
            retrieval_result.web_sources = web_sources

    # --- 6a. No-results short circuit ----------------------------------------
    if no_results:
        await _save_assistant_message(
            conversation.id,
            content=_NO_RESULTS_ANSWER,
            status="complete",
            mode=chat_request.mode,
            model=settings.llm_model,
            citations=[],
        )
        if settings.llm_streaming_enabled:
            async def _no_results_stream() -> AsyncGenerator[str, None]:
                if created:
                    yield conversation_event(conversation.id)
                yield f"data: {_NO_RESULTS_ANSWER}\n\n"
                yield "event: citations\ndata: []\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(_no_results_stream(), media_type="text/event-stream")

        return ChatResponse(
            answer=_NO_RESULTS_ANSWER,
            citations=[],
            model=settings.llm_model,
            conversation_id=conversation.id,
            retrieval_query=retrieval_query,
        )

    # --- 6b. Streaming path ---------------------------------------------------
    if settings.llm_streaming_enabled:
        conversation_id = conversation.id

        async def _stream() -> AsyncGenerator[str, None]:
            capture = StreamCapture()
            status = "error"
            try:
                if created:
                    yield conversation_event(conversation_id)
                async for event in generator.stream(
                    message_text, retrieval_result, chat_request.mode,
                    history=history, capture=capture,
                ):
                    yield event
                status = "complete"
            except RateLimitError:
                yield "event: error\ndata: Rate limit reached. Please try again shortly.\n\n"
            except GenerationTimeoutError:
                yield "event: error\ndata: The request timed out. Please try again.\n\n"
            except ProviderUnavailableError:
                yield "event: error\ndata: AI service is temporarily unavailable.\n\n"
            except (NoContextError, MalformedResponseError) as exc:
                logger.error("[chat] Generation error: %s", exc)
                yield "event: error\ndata: Failed to generate a response.\n\n"
            finally:
                # Reached on every exit: normal completion, a provider error, and
                # a client disconnect (which throws GeneratorExit in at the yield
                # above). `status` is still "error" unless the loop ran to the
                # end, so an abandoned answer is stored as what it is.
                if status != "complete" and capture.tokens:
                    status = "partial"

                text = capture.text
                if text or status == "error":
                    task = _persist_in_background(
                        _save_assistant_message(
                            conversation_id,
                            content=text,
                            status=status,
                            mode=chat_request.mode,
                            model=settings.llm_model,
                            citations=[asdict(c) for c in capture.citations],
                        )
                    )
                    try:
                        await asyncio.shield(task)
                    except asyncio.CancelledError:
                        # The request is being cancelled around us. The write is a
                        # separate, shielded task, so it survives and finishes;
                        # _pending_writes holds the reference until it does.
                        logger.info(
                            "[chat] cancelled during save of %s message for %s",
                            status, conversation_id,
                        )

        return StreamingResponse(_stream(), media_type="text/event-stream")

    # --- 6c. Non-streaming path ----------------------------------------------
    try:
        llm_response = await generator.generate(
            message_text, retrieval_result, chat_request.mode, history=history
        )
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Rate limit reached. Please try again shortly.")
    except GenerationTimeoutError:
        raise HTTPException(status_code=504, detail="The request timed out.")
    except ProviderUnavailableError as exc:
        logger.error("[chat] Provider unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="AI service is temporarily unavailable.")
    except (NoContextError, MalformedResponseError) as exc:
        logger.error("[chat] Generation error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate a response.")

    citations = [
        CitationOut(
            document_id=c.document_id,
            filename=c.filename,
            page=c.page,
            chunk_index=c.chunk_index,
            source_type=c.source_type,
            title=c.title,
            url=c.url,
        )
        for c in llm_response.citations
    ]

    await _save_assistant_message(
        conversation.id,
        content=llm_response.answer,
        status="complete",
        mode=chat_request.mode,
        model=llm_response.model,
        citations=[asdict(c) for c in llm_response.citations],
    )

    return ChatResponse(
        answer=llm_response.answer,
        citations=citations,
        model=llm_response.model,
        conversation_id=conversation.id,
        retrieval_query=retrieval_query,
    )
