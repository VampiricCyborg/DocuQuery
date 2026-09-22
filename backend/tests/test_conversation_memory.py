"""
Unit tests for the conversation-memory logic that needs no database.

The database-backed behaviour lives in tests/test_integration_conversations.py.
What is covered here is the shaping that happens either side of it: how turns are
paired, how each provider lays a history list onto its own wire format, and how
the query condenser behaves when the provider misbehaves.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.llm.condenser import MAX_REWRITE_CHARS, _clean, condense_query
from app.llm.exceptions import ProviderUnavailableError, RateLimitError
from app.llm.models import HistoryMessage, LLMRequest, StreamCapture
from app.llm.providers.base import (
    build_anthropic_messages,
    build_chat_messages,
    build_user_turn,
)
from app.llm.providers.gemini_provider import GeminiProvider
from app.llm.stream import conversation_event, stream_with_citations
from app.services.conversation_service import _pair_into_turns, title_from_message

# pytest.ini sets asyncio_mode = auto, so async tests need no marker.


def _msg(role: str, content: str):
    return SimpleNamespace(role=role, content=content)


HISTORY = [
    HistoryMessage("user", "What are the RMF steps?"),
    HistoryMessage("assistant", "Prepare, categorize, select."),
]


def _request(**overrides) -> LLMRequest:
    return LLMRequest(
        system_prompt=overrides.pop("system_prompt", "SYSTEM"),
        user_message=overrides.pop("user_message", "Which comes after categorisation?"),
        context=overrides.pop("context", "[1] passage text"),
        model="test-model",
        temperature=0.1,
        max_tokens=256,
        history=overrides.pop("history", list(HISTORY)),
    )


# --- Turn pairing ------------------------------------------------------------

def test_pairing_keeps_complete_exchanges_in_order():
    paired = _pair_into_turns(
        [_msg("user", "q1"), _msg("assistant", "a1"), _msg("user", "q2"), _msg("assistant", "a2")]
    )
    assert [(u.content, a.content) for u, a in paired] == [("q1", "a1"), ("q2", "a2")]


def test_pairing_drops_a_user_message_that_was_never_answered():
    """
    A question whose answer failed is not replayed on its own.

    Beyond being poor context, an unpaired message breaks role alternation, which
    Anthropic's Messages API rejects outright -- so this would fail on one
    provider and quietly degrade on the rest.
    """
    paired = _pair_into_turns(
        [_msg("user", "unanswered"), _msg("user", "q2"), _msg("assistant", "a2")]
    )
    assert [(u.content, a.content) for u, a in paired] == [("q2", "a2")]


def test_pairing_drops_a_leading_assistant_message():
    paired = _pair_into_turns([_msg("assistant", "orphan"), _msg("user", "q"), _msg("assistant", "a")])
    assert [(u.content, a.content) for u, a in paired] == [("q", "a")]


def test_pairing_of_an_empty_thread_is_empty():
    assert _pair_into_turns([]) == []


# --- Titles ------------------------------------------------------------------

def test_title_is_the_first_message_when_it_is_short():
    assert title_from_message("What is zero trust?") == "What is zero trust?"


def test_title_is_truncated_with_an_ellipsis():
    title = title_from_message("word " * 100)
    assert len(title) <= 60
    assert title.endswith("…")


def test_title_collapses_whitespace_and_survives_an_empty_message():
    assert title_from_message("a\n\n  b\tc") == "a b c"
    assert title_from_message("   ") == "New Chat"


# --- Provider wire formats ---------------------------------------------------

def test_openai_style_providers_replay_history_between_system_and_question():
    messages = build_chat_messages(_request())
    assert [m["role"] for m in messages] == ["system", "user", "assistant", "user"]
    assert messages[0]["content"] == "SYSTEM"
    assert messages[1]["content"] == "What are the RMF steps?"
    assert messages[-1]["content"].endswith("Question: Which comes after categorisation?")


def test_anthropic_omits_the_system_message_from_the_list():
    """Anthropic takes `system` as a top-level parameter, not a message."""
    messages = build_anthropic_messages(_request())
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    assert all(m["role"] != "system" for m in messages)


def test_anthropic_history_strictly_alternates():
    roles = [m["role"] for m in build_anthropic_messages(_request())]
    assert all(a != b for a, b in zip(roles, roles[1:]))


def test_gemini_maps_the_assistant_role_to_model():
    contents = GeminiProvider._build_contents(_request())
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert contents[1]["parts"] == ["Prepare, categorize, select."]


def test_every_provider_sees_the_same_number_of_turns():
    request = _request()
    chat = [m for m in build_chat_messages(request) if m["role"] != "system"]
    anthropic = build_anthropic_messages(request)
    gemini = GeminiProvider._build_contents(request)
    assert len(chat) == len(anthropic) == len(gemini) == len(HISTORY) + 1


def test_an_empty_context_sends_the_message_alone():
    """LLM mode and the condenser have no passages to prepend."""
    assert build_user_turn(_request(context="", user_message="hello")) == "hello"


def test_context_is_still_framed_as_a_question_when_present():
    turn = build_user_turn(_request(context="PASSAGE", user_message="why?"))
    assert turn == "PASSAGE\n\nQuestion: why?"


# --- Condenser ---------------------------------------------------------------

class _Provider:
    def __init__(self, answer: str = "", raises: Exception | None = None, delay: float = 0.0):
        self._answer = answer
        self._raises = raises
        self._delay = delay
        self.calls = 0

    async def generate(self, request):
        self.calls += 1
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._raises:
            raise self._raises
        return SimpleNamespace(answer=self._answer, citations=[], model=request.model)

    async def stream(self, request):
        yield self._answer

    async def health_check(self) -> bool:
        return True


@pytest.fixture
def condense_settings(monkeypatch):
    def _apply(**overrides):
        settings = Settings(debug=True, **overrides)
        monkeypatch.setattr("app.llm.condenser.get_settings", lambda: settings)
        return settings

    return _apply


async def test_condensing_rewrites_a_follow_up(condense_settings):
    condense_settings()
    provider = _Provider(answer="How does a policy enforcement point differ from a policy engine?")

    result = await condense_query(provider, "How does it differ?", HISTORY)

    assert result.rewritten is True
    assert result.outcome == "ok"
    assert result.query.startswith("How does a policy enforcement point")


async def test_condensing_is_skipped_without_history(condense_settings):
    condense_settings()
    provider = _Provider(answer="never used")

    result = await condense_query(provider, "a standalone question", [])

    assert result.query == "a standalone question"
    assert result.outcome == "skipped"
    # No history means no ambiguity to resolve, so no call is worth its latency.
    assert provider.calls == 0


async def test_condensing_can_be_turned_off(condense_settings):
    condense_settings(chat_condense_enabled=False)
    provider = _Provider(answer="rewrite")

    result = await condense_query(provider, "raw message", HISTORY)

    assert result.query == "raw message"
    assert provider.calls == 0


async def test_condensing_falls_back_to_the_raw_message_on_timeout(condense_settings):
    condense_settings(chat_condense_timeout=0.05)
    provider = _Provider(answer="too late", delay=5)

    result = await condense_query(provider, "How does it differ?", HISTORY)

    assert result.query == "How does it differ?"
    assert result.rewritten is False
    assert result.outcome == "timeout"


@pytest.mark.parametrize(
    "error", [RateLimitError("429"), ProviderUnavailableError("503")]
)
async def test_condensing_falls_back_when_the_provider_errors(condense_settings, error):
    condense_settings()
    provider = _Provider(raises=error)

    result = await condense_query(provider, "How does it differ?", HISTORY)

    assert result.query == "How does it differ?"
    assert result.outcome == "provider_error"


async def test_condensing_rejects_an_answer_instead_of_a_query(condense_settings):
    """A reply long enough to be an answer means the model ignored the prompt."""
    condense_settings()
    provider = _Provider(answer="x" * (MAX_REWRITE_CHARS + 1))

    result = await condense_query(provider, "raw", HISTORY)

    assert result.query == "raw"
    assert result.outcome == "rejected"


async def test_condensing_rejects_an_empty_reply(condense_settings):
    condense_settings()
    result = await condense_query(_Provider(answer="   "), "raw", HISTORY)
    assert result.query == "raw"
    assert result.outcome == "rejected"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("plain rewrite", "plain rewrite"),
        ('"quoted rewrite"', "quoted rewrite"),
        ("Standalone search query: the rewrite", "the rewrite"),
        ("Query: the rewrite", "the rewrite"),
        ("\n\n  the rewrite  \n trailing junk", "the rewrite"),
    ],
)
def test_clean_reduces_a_reply_to_one_query(raw, expected):
    assert _clean(raw) == expected


# --- Stream capture ----------------------------------------------------------

async def test_stream_capture_records_tokens_for_persistence():
    async def tokens():
        for token in ["one ", "two ", "three"]:
            yield token

    capture = StreamCapture()
    frames = [frame async for frame in stream_with_citations(tokens(), [], capture=capture)]

    assert capture.text == "one two three"
    assert frames[-1] == "data: [DONE]\n\n"


async def test_stream_capture_holds_a_partial_answer_when_the_consumer_leaves():
    """This is what makes a `partial` save possible: the text survives the abort."""
    async def tokens():
        for token in ["kept ", "also kept ", "never seen"]:
            yield token

    capture = StreamCapture()
    stream = stream_with_citations(tokens(), [], capture=capture)
    async for _ in stream:
        if len(capture.tokens) == 2:
            break
    await stream.aclose()

    assert capture.text == "kept also kept "


def test_conversation_event_is_well_formed_sse():
    frame = conversation_event("abc-123")
    assert frame.startswith("event: conversation\ndata: ")
    assert frame.endswith("\n\n")
    assert '"id": "abc-123"' in frame
