"""
Conversation persistence against real PostgreSQL.

Four things are proved here, all of which are invisible to the mocked unit tier:

  1. every conversation route is scoped to the caller, and another user's id is
     indistinguishable from one that does not exist
  2. prior turns actually reach the provider -- asserted on the message list the
     provider is handed, not on the fact that some history was loaded
  3. a condenser timeout degrades to the raw message instead of failing the request
  4. a client that disconnects mid-answer still leaves a `partial` message behind

Skipped in full when TEST_DATABASE_URL is unset; see conftest.py.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import Settings
from app.database.models import Conversation, Message

# asyncio_mode = auto in pytest.ini handles the async marker.
pytestmark = pytest.mark.integration


# --- Ownership isolation ----------------------------------------------------

@pytest_asyncio.fixture
async def two_users(make_user):
    owner = await make_user("owner@example.com", name="Owner")
    intruder = await make_user("intruder@example.com", name="Intruder")
    return owner, intruder


async def test_list_returns_only_the_callers_conversations(
    client, two_users, make_conversation
):
    owner, intruder = two_users
    await make_conversation(owner.id, title="Owner thread")
    await make_conversation(intruder.id, title="Intruder thread")

    response = await client.get("/conversations", cookies=owner.cookies)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [c["title"] for c in body["items"]] == ["Owner thread"]


@pytest.mark.parametrize(
    "method,suffix,payload",
    [
        ("get", "", None),
        ("patch", "", {"title": "renamed"}),
        ("delete", "", None),
    ],
)
async def test_other_users_conversation_is_404_not_403(
    client, two_users, make_conversation, method, suffix, payload
):
    """
    A foreign id must be indistinguishable from a missing one.

    403 would confirm that the id exists and belongs to somebody, which lets an
    attacker enumerate real conversation ids without reading a single message.
    """
    owner, intruder = two_users
    conversation = await make_conversation(owner.id)

    call = getattr(client, method)
    kwargs = {"cookies": intruder.cookies}
    if payload is not None:
        kwargs["json"] = payload
    response = await call(f"/conversations/{conversation.id}{suffix}", **kwargs)

    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found."


async def test_other_users_conversation_survives_a_foreign_delete(
    client, db_session, two_users, make_conversation
):
    """The 404 above must be a refusal, not a delete that happened to report oddly."""
    owner, intruder = two_users
    conversation = await make_conversation(owner.id)

    await client.delete(f"/conversations/{conversation.id}", cookies=intruder.cookies)

    still_there = await db_session.scalar(
        select(Conversation).where(Conversation.id == conversation.id)
    )
    assert still_there is not None


async def test_feedback_on_another_users_message_is_404(
    client, db_session, two_users, make_conversation
):
    owner, intruder = two_users
    conversation = await make_conversation(owner.id, turns=[("q", "a")])
    message = await db_session.scalar(
        select(Message).where(
            Message.conversation_id == conversation.id, Message.role == "assistant"
        )
    )

    response = await client.patch(
        f"/conversations/{conversation.id}/messages/{message.id}/feedback",
        json={"feedback": "up"},
        cookies=intruder.cookies,
    )

    assert response.status_code == 404
    await db_session.refresh(message)
    assert message.feedback is None


async def test_owner_can_read_pin_rename_and_delete(client, two_users, make_conversation):
    owner, _ = two_users
    conversation = await make_conversation(owner.id, turns=[("first question", "first answer")])

    detail = await client.get(f"/conversations/{conversation.id}", cookies=owner.cookies)
    assert detail.status_code == 200
    assert [m["content"] for m in detail.json()["messages"]] == [
        "first question", "first answer",
    ]

    patched = await client.patch(
        f"/conversations/{conversation.id}",
        json={"title": "Renamed", "pinned": True},
        cookies=owner.cookies,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Renamed"
    assert patched.json()["pinned"] is True
    # A rename must not disturb the mode it did not mention.
    assert patched.json()["mode"] == conversation.mode

    deleted = await client.delete(f"/conversations/{conversation.id}", cookies=owner.cookies)
    assert deleted.status_code == 204

    gone = await client.get(f"/conversations/{conversation.id}", cookies=owner.cookies)
    assert gone.status_code == 404


async def test_deleting_a_conversation_cascades_to_its_messages(
    client, db_session, two_users, make_conversation
):
    owner, _ = two_users
    conversation = await make_conversation(owner.id, turns=[("q1", "a1"), ("q2", "a2")])

    await client.delete(f"/conversations/{conversation.id}", cookies=owner.cookies)

    remaining = await db_session.scalars(
        select(Message).where(Message.conversation_id == conversation.id)
    )
    assert list(remaining) == []


async def test_import_is_scoped_to_the_caller(client, db_session, two_users):
    owner, _ = two_users
    response = await client.post(
        "/conversations/import",
        json={
            "conversations": [
                {
                    "title": "From localStorage",
                    "mode": "docuquery",
                    "pinned": True,
                    "messages": [
                        {"role": "user", "content": "hello"},
                        {"role": "assistant", "content": "hi"},
                    ],
                },
                # Empty threads are the "New Chat" rows the old store created on
                # click. They are skipped rather than restored.
                {"title": "Never used", "messages": []},
            ]
        },
        cookies=owner.cookies,
    )

    assert response.status_code == 200
    assert response.json() == {"imported": 1, "skipped": 1}

    rows = list(await db_session.scalars(select(Conversation)))
    assert len(rows) == 1
    assert rows[0].user_id == owner.id
    assert rows[0].pinned is True


async def test_import_rejects_more_than_two_hundred_conversations(client, two_users):
    owner, _ = two_users
    payload = {
        "conversations": [
            {"title": f"c{i}", "messages": [{"role": "user", "content": "x"}]}
            for i in range(201)
        ]
    }

    response = await client.post("/conversations/import", json=payload, cookies=owner.cookies)

    assert response.status_code == 422


async def test_every_conversation_route_requires_authentication(client, two_users, make_conversation):
    owner, _ = two_users
    conversation = await make_conversation(owner.id)

    assert (await client.get("/conversations")).status_code == 401
    assert (await client.post("/conversations", json={})).status_code == 401
    assert (await client.get(f"/conversations/{conversation.id}")).status_code == 401
    assert (
        await client.patch(f"/conversations/{conversation.id}", json={"pinned": True})
    ).status_code == 401
    assert (await client.delete(f"/conversations/{conversation.id}")).status_code == 401
    assert (
        await client.post("/conversations/import", json={"conversations": []})
    ).status_code == 401


# --- History reaches the provider -------------------------------------------

class RecordingProvider:
    """
    A provider that records the LLMRequest it was handed and streams a fixed reply.

    Asserting on `seen` is the point: a test that only checks that history was
    loaded would still pass if the provider silently dropped it, which is exactly
    the bug this phase fixes.
    """

    def __init__(
        self,
        reply: str = "recorded answer",
        tokens: list[str] | None = None,
        token_delay: float = 0.0,
    ):
        self.seen: list = []
        # Kept apart because the two calls mean different things: `generate` during
        # a streaming chat is the query condenser, `stream` is the answer. A single
        # list makes "what did the answer prompt see?" ambiguous.
        self.generated: list = []
        self.streamed: list = []
        self._reply = reply
        self._tokens = tokens
        self._token_delay = token_delay

    @property
    def last(self):
        return self.seen[-1]

    async def generate(self, request):
        self.seen.append(request)
        self.generated.append(request)
        return SimpleNamespace(
            answer=self._reply, citations=[], model=request.model,
            prompt_tokens=None, completion_tokens=None,
        )

    async def stream(self, request):
        self.seen.append(request)
        self.streamed.append(request)
        for index, token in enumerate(self._tokens or [self._reply]):
            # A delay between tokens leaves the route's generator genuinely
            # suspended at a yield, which is what a mid-stream disconnect needs.
            if index and self._token_delay:
                await asyncio.sleep(self._token_delay)
            yield token

    async def health_check(self) -> bool:
        return True


def fake_retrieval_returning(chunk_text: str, sink: list[str]):
    """
    A stand-in for run_retrieval_pipeline that records the query it was given.

    It returns one real chunk on purpose. An empty result sends docuquery mode
    into NoContextError before the provider is ever called, so a test that used
    an empty one would be measuring the guard rather than the query.
    """
    from app.retrieval.retrieval_pipeline import ChunkResult, RetrievalResult

    async def _fake(query, db, user_id, top_k, filters):
        sink.append(query)
        return RetrievalResult(
            query=query,
            chunks=[
                ChunkResult(
                    document_id="doc-1",
                    filename="NIST.SP.800-207.pdf",
                    page=7,
                    chunk_index=0,
                    similarity=0.71,
                    text=chunk_text,
                )
            ],
            context=chunk_text,
            citations=[],
            total_retrieved=1,
        )

    return _fake


@pytest.fixture
def stub_chat(monkeypatch):
    """
    Point /chat at a recording provider and skip retrieval.

    Retrieval is stubbed to an empty result in `llm` mode, so these tests measure
    the conversation plumbing rather than the embedding model -- which the
    integration container does not have loaded.
    """
    from app.llm.response_generator import ResponseGenerator

    def _install(provider, **setting_overrides):
        generator = ResponseGenerator(provider=provider)
        monkeypatch.setattr("app.api.chat.get_response_generator", lambda: generator)
        settings = Settings(debug=True, **setting_overrides)
        monkeypatch.setattr("app.api.chat.get_settings", lambda: settings)
        monkeypatch.setattr("app.llm.response_generator.get_settings", lambda: settings)
        monkeypatch.setattr("app.llm.condenser.get_settings", lambda: settings)
        return generator

    return _install


async def test_history_is_replayed_to_the_provider(
    client, two_users, make_conversation, stub_chat
):
    owner, _ = two_users
    conversation = await make_conversation(
        owner.id,
        mode="llm",
        turns=[
            ("What are the RMF steps?", "Prepare, categorize, select, implement."),
            ("Who publishes it?", "NIST."),
        ],
    )
    provider = RecordingProvider()
    stub_chat(provider, llm_streaming_enabled=False)

    response = await client.post(
        "/chat",
        json={
            "message": "Which one comes first?",
            "conversation_id": conversation.id,
            "mode": "llm",
        },
        cookies=owner.cookies,
    )

    assert response.status_code == 200
    request = provider.last

    # Oldest first, strictly alternating, and the live message is NOT duplicated
    # into its own history.
    assert [(h.role, h.content) for h in request.history] == [
        ("user", "What are the RMF steps?"),
        ("assistant", "Prepare, categorize, select, implement."),
        ("user", "Who publishes it?"),
        ("assistant", "NIST."),
    ]
    assert request.user_message == "Which one comes first?"


async def test_history_is_capped_by_the_turn_limit(
    client, two_users, make_conversation, stub_chat
):
    owner, _ = two_users
    conversation = await make_conversation(
        owner.id, mode="llm",
        turns=[(f"question {i}", f"answer {i}") for i in range(10)],
    )
    provider = RecordingProvider()
    stub_chat(provider, llm_streaming_enabled=False, chat_history_turns=2)

    await client.post(
        "/chat",
        json={"message": "and now?", "conversation_id": conversation.id, "mode": "llm"},
        cookies=owner.cookies,
    )

    # The two most recent turns, oldest of them first -- the oldest are dropped.
    assert [h.content for h in provider.last.history] == [
        "question 8", "answer 8", "question 9", "answer 9",
    ]


async def test_history_budget_drops_whole_turns_from_the_oldest_end(
    client, two_users, make_conversation, stub_chat
):
    """
    The budget must never cut inside a turn: a question without its answer, or an
    answer without its question, is worse context than one turn fewer.
    """
    owner, _ = two_users
    long_answer = "x" * 2000  # ~500 estimated tokens
    conversation = await make_conversation(
        owner.id, mode="llm",
        turns=[("old question", long_answer), ("recent question", "short answer")],
    )
    provider = RecordingProvider()
    stub_chat(provider, llm_streaming_enabled=False, chat_history_max_tokens=100)

    await client.post(
        "/chat",
        json={"message": "next", "conversation_id": conversation.id, "mode": "llm"},
        cookies=owner.cookies,
    )

    assert [h.content for h in provider.last.history] == ["recent question", "short answer"]


async def test_first_message_of_a_conversation_has_no_history(
    client, two_users, stub_chat
):
    owner, _ = two_users
    provider = RecordingProvider()
    stub_chat(provider, llm_streaming_enabled=False)

    response = await client.post(
        "/chat", json={"message": "opening question", "mode": "llm"}, cookies=owner.cookies
    )

    assert response.status_code == 200
    assert provider.last.history == []
    assert response.json()["conversation_id"]


# --- /chat conversation lifecycle -------------------------------------------

async def test_new_chat_emits_the_conversation_event_first(
    client, db_session, two_users, stub_chat
):
    owner, _ = two_users
    stub_chat(RecordingProvider(tokens=["one ", "two"]), llm_streaming_enabled=True)

    async with client.stream(
        "POST", "/chat", json={"message": "hello", "mode": "llm"}, cookies=owner.cookies
    ) as response:
        assert response.status_code == 200
        frames = [line async for line in response.aiter_lines()]

    # First non-empty line of the stream, before any token.
    head = [line for line in frames if line][:2]
    assert head[0] == "event: conversation"
    conversation_id = json.loads(head[1].removeprefix("data: "))["id"]

    stored = await db_session.scalar(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    assert stored is not None
    assert stored.user_id == owner.id


async def test_existing_conversation_does_not_re_emit_the_conversation_event(
    client, two_users, make_conversation, stub_chat
):
    owner, _ = two_users
    conversation = await make_conversation(owner.id, mode="llm")
    stub_chat(RecordingProvider(tokens=["hi"]), llm_streaming_enabled=True)

    async with client.stream(
        "POST", "/chat",
        json={"message": "hello", "conversation_id": conversation.id, "mode": "llm"},
        cookies=owner.cookies,
    ) as response:
        frames = [line async for line in response.aiter_lines()]

    assert "event: conversation" not in frames


async def test_unknown_conversation_id_is_404_before_streaming(client, two_users, stub_chat):
    owner, _ = two_users
    stub_chat(RecordingProvider(), llm_streaming_enabled=True)

    response = await client.post(
        "/chat",
        json={"message": "hello", "conversation_id": "does-not-exist", "mode": "llm"},
        cookies=owner.cookies,
    )

    # A real status code, not a 200 whose body happens to carry an SSE error frame.
    assert response.status_code == 404
    assert "text/event-stream" not in response.headers.get("content-type", "")


async def test_foreign_conversation_id_is_404_before_streaming(
    client, two_users, make_conversation, stub_chat
):
    owner, intruder = two_users
    conversation = await make_conversation(owner.id, mode="llm")
    stub_chat(RecordingProvider(), llm_streaming_enabled=True)

    response = await client.post(
        "/chat",
        json={"message": "hello", "conversation_id": conversation.id, "mode": "llm"},
        cookies=intruder.cookies,
    )

    assert response.status_code == 404


async def test_both_turns_are_persisted_and_the_title_comes_from_the_first_message(
    client, db_session, two_users, stub_chat
):
    owner, _ = two_users
    stub_chat(RecordingProvider(reply="the answer"), llm_streaming_enabled=False)

    response = await client.post(
        "/chat",
        json={"message": "What is a policy enforcement point?", "mode": "llm"},
        cookies=owner.cookies,
    )
    conversation_id = response.json()["conversation_id"]

    rows = list(
        await db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
    )
    assert [(m.role, m.content, m.status) for m in rows] == [
        ("user", "What is a policy enforcement point?", "complete"),
        ("assistant", "the answer", "complete"),
    ]

    conversation = await db_session.scalar(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    # Title is the first user message, truncated -- no extra LLM call was made.
    assert conversation.title == "What is a policy enforcement point?"


async def test_regenerate_replaces_the_answer_instead_of_appending_a_turn(
    client, db_session, two_users, make_conversation, stub_chat
):
    owner, _ = two_users
    conversation = await make_conversation(
        owner.id, mode="llm", turns=[("the question", "the first answer")]
    )
    stub_chat(RecordingProvider(reply="the second answer"), llm_streaming_enabled=False)

    response = await client.post(
        "/chat",
        json={"conversation_id": conversation.id, "mode": "llm", "regenerate": True},
        cookies=owner.cookies,
    )

    assert response.status_code == 200
    rows = list(
        await db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at)
        )
    )
    assert [(m.role, m.content) for m in rows] == [
        ("user", "the question"),
        ("assistant", "the second answer"),
    ]


# --- Condenser fallback ------------------------------------------------------

class HangingCondenserProvider(RecordingProvider):
    """
    Times out on the condensing call, answers the real one.

    Condensing is the only `generate` during a streaming chat, so sleeping there
    and streaming normally isolates the timeout to the step under test.
    """

    async def generate(self, request):
        self.seen.append(request)
        await asyncio.sleep(3600)


async def test_condenser_timeout_falls_back_to_the_raw_message(
    client, two_users, make_conversation, stub_chat, monkeypatch, caplog
):
    owner, _ = two_users
    conversation = await make_conversation(
        owner.id,
        mode="docuquery",
        turns=[("What is a policy enforcement point?", "It enforces access decisions.")],
    )

    provider = HangingCondenserProvider(tokens=["fallback answer"])
    stub_chat(
        provider,
        llm_streaming_enabled=False,
        chat_query_rewrite_timeout=0.05,
        chat_query_rewrite=True,
    )

    retrieved: list[str] = []
    monkeypatch.setattr(
        "app.api.chat.run_retrieval_pipeline",
        fake_retrieval_returning("A policy enforcement point enforces access decisions.", retrieved),
    )

    # The answer call must not also hang, so swap the provider's generate back
    # once condensing has had its turn.
    original_generate = provider.generate

    async def generate_once_then_answer(request):
        if not provider.seen:
            return await original_generate(request)
        provider.seen.append(request)
        return SimpleNamespace(
            answer="fallback answer", citations=[], model=request.model,
            prompt_tokens=None, completion_tokens=None,
        )

    provider.generate = generate_once_then_answer

    response = await client.post(
        "/chat",
        json={
            "message": "How does it differ from the policy engine?",
            "conversation_id": conversation.id,
            "mode": "docuquery",
        },
        cookies=owner.cookies,
    )

    assert response.status_code == 200
    # Retrieval ran on the user's literal words, because the rewrite timed out.
    assert retrieved == ["How does it differ from the policy engine?"]
    assert response.json()["retrieval_query"] == "How does it differ from the policy engine?"


async def test_condensed_query_is_used_for_retrieval_but_not_for_the_answer(
    client, two_users, make_conversation, stub_chat, monkeypatch
):
    owner, _ = two_users
    conversation = await make_conversation(
        owner.id,
        mode="docuquery",
        turns=[("What is a policy enforcement point?", "It enforces access decisions.")],
    )

    rewrite = "How does a policy enforcement point differ from a policy engine?"

    # `reply` is what the condenser's generate() returns; `tokens` is the answer.
    provider = RecordingProvider(reply=rewrite, tokens=["grounded answer"])
    stub_chat(provider, llm_streaming_enabled=True, chat_query_rewrite=True)

    retrieved: list[str] = []
    monkeypatch.setattr(
        "app.api.chat.run_retrieval_pipeline",
        fake_retrieval_returning("A policy enforcement point enforces access decisions.", retrieved),
    )

    original = "How does it differ from the policy engine?"
    async with client.stream(
        "POST", "/chat",
        json={"message": original, "conversation_id": conversation.id, "mode": "docuquery"},
        cookies=owner.cookies,
    ) as response:
        [line async for line in response.aiter_lines()]

    # Retrieval saw the standalone rewrite ...
    assert retrieved == [rewrite]
    # ... while the answer prompt still saw what the user actually typed.
    assert len(provider.streamed) == 1
    assert provider.streamed[0].user_message == original
    # And the condenser was the one that got the transcript.
    assert len(provider.generated) == 1
    assert original in provider.generated[0].user_message


# --- Partial save on disconnect ---------------------------------------------

async def test_client_disconnect_saves_a_partial_message(
    live_server, client, db_session, two_users, make_conversation, stub_chat
):
    """
    Abandoning the stream must still leave behind the text the user saw.

    This one needs a real socket. httpx's ASGITransport buffers the whole
    response body before handing back a single line, so the application always
    runs to completion under it and a mid-stream disconnect cannot happen at all
    -- the route would record an ordinary `complete` message and the test would
    pass while proving nothing.
    """
    owner, _ = two_users
    conversation = await make_conversation(owner.id, mode="llm")
    # Without a delay the whole answer is produced before the client can walk
    # away, even over a real connection.
    stub_chat(
        RecordingProvider(tokens=["first ", "second ", "third"], token_delay=0.4),
        llm_streaming_enabled=True,
    )

    async with AsyncClient(base_url=live_server, timeout=10.0) as http:
        async with http.stream(
            "POST", "/chat",
            json={
                "message": "tell me a long story",
                "conversation_id": conversation.id,
                "mode": "llm",
            },
            cookies=owner.cookies,
        ) as response:
            assert response.status_code == 200
            async for line in response.aiter_lines():
                if line.startswith("event: token"):
                    break  # walk away mid-answer
        # Leaving the context closes the socket; the server sees http.disconnect.

    stored = None
    # The save runs on a task the disconnect does not cancel, from a session of
    # its own. Poll rather than sleep a fixed amount.
    for _ in range(100):
        await asyncio.sleep(0.05)
        stored = await db_session.scalar(
            select(Message).where(
                Message.conversation_id == conversation.id, Message.role == "assistant"
            )
        )
        if stored is not None:
            break

    assert stored is not None, "no assistant message was written after the disconnect"
    assert stored.status == "partial"
    # Only what had actually been generated when the client left.
    assert stored.content == "first "
    assert stored.content != "first second third"
