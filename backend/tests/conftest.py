"""
Shared pytest fixtures.

The bulk of this suite runs against mocks and needs no services. The fixtures below
add a second tier: tests marked `@pytest.mark.integration` run against a real
PostgreSQL database with the pgvector extension, so that SQL, constraints, cascades
and the ownership filters in the query layer are actually exercised.

Integration tests are opt-in via TEST_DATABASE_URL. When it is unset every
integration test is skipped, so `pytest -q` on a laptop with no database behaves
exactly as it did before. CI sets it to a pgvector/pgvector:pg16 service container.

    # local -- port 5434, not 5433: the dev stack's docker compose already binds
    # 5433, and the fixtures below TRUNCATE whatever they are pointed at.
    docker run -d --name docuquery-test-db -p 5434:5432 \
        -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=docuquery_test pgvector/pgvector:pg16
    export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5434/docuquery_test
    pytest -q -m integration
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine,
)
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Tables emptied between integration tests. Ordering is irrelevant because the
# TRUNCATE is a single statement with CASCADE, but dependents are listed first to
# make the direction obvious to a reader. `messages` and `conversations` would be
# reached anyway through users' CASCADE; naming them keeps the list honest about
# what the fixture empties.
_TRUNCATE_TABLES = ("document_chunks", "documents", "messages", "conversations", "users")

# Alembic's env.py reads the app Settings, which refuse to build without AUTH_SECRET
# whenever DEBUG is false. The migration subprocess therefore needs one of its own;
# it never signs a cookie that leaves the test process.
_SUBPROCESS_AUTH_SECRET = "integration-test-secret-not-used-for-any-real-session"


def integration_database_url() -> str | None:
    """The database integration tests run against, or None when they are disabled."""
    return os.environ.get("TEST_DATABASE_URL") or None


def run_alembic(*args: str, database_url: str) -> subprocess.CompletedProcess[str]:
    """
    Invoke the Alembic CLI against `database_url` in a subprocess.

    A subprocess rather than an in-process `alembic.command` call for two reasons:
    migrations/env.py calls `asyncio.run()`, which raises when it is reached from
    inside pytest-asyncio's already-running event loop; and it resolves the URL from
    a `functools.lru_cache`d Settings object, so pointing it at the test database
    in-process would leak that override into every later test in the session.
    """
    env = {
        **os.environ,
        "DATABASE_URL": database_url,
        "AUTH_SECRET": os.environ.get("AUTH_SECRET") or _SUBPROCESS_AUTH_SECRET,
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture(scope="session")
def database_url() -> str:
    """Skip the whole integration tier when no test database is configured."""
    url = integration_database_url()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set — integration tests are disabled")
    return url


@pytest.fixture(scope="session")
def migrated_database(database_url: str) -> str:
    """
    Bring the test database to `head` once per session.

    Downgrading to base first makes the fixture idempotent against a database left
    behind by a previous run, so a developer does not have to drop the container to
    get a clean session.
    """
    run_alembic("downgrade", "base", database_url=database_url)
    run_alembic("upgrade", "head", database_url=database_url)
    return database_url


@pytest_asyncio.fixture
async def test_engine(migrated_database: str) -> AsyncGenerator[AsyncEngine, None]:
    """
    An engine on the migrated test database, with the tables emptied first.

    Separate from `db_session` because application code that opens its own session
    -- /chat saving an assistant message after the request session has closed --
    needs the engine itself to build a sessionmaker from. `db_session.get_bind()`
    is not that: on an AsyncSession it returns the *sync* Engine proxy, which
    `async_sessionmaker` rejects.
    """
    # NullPool: each test gets its own connections and disposes of them, rather than
    # leaving pooled ones open against a container that the next test truncates.
    engine = create_async_engine(migrated_database, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE"))
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """A session against the migrated, emptied test database."""
    sessionmaker = async_sessionmaker(test_engine, expire_on_commit=False)
    async with sessionmaker() as session:
        yield session


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession, test_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[AsyncClient, None]:
    """
    An HTTP client bound to the real test database.

    `get_db` is overridden to hand every request the one session the test also holds,
    so a row the test writes is visible to the request and vice versa.

    `app.api.chat.AsyncSessionLocal` is redirected at the same engine. Overriding
    `get_db` is not enough on its own: /chat saves the assistant message from the
    streaming generator's `finally`, where the request-scoped session is already
    closed, so it opens one of its own from the sessionmaker. Left alone that
    sessionmaker points at the *application's* DATABASE_URL, and every assistant
    message an integration test provoked would be written to the developer's own
    database instead of the disposable one -- invisible to the assertions here,
    and quietly polluting a database this suite was never pointed at.
    """
    from app.api.dependencies import get_db
    from app.main import app

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    monkeypatch.setattr(
        "app.api.chat.AsyncSessionLocal",
        async_sessionmaker(test_engine, expire_on_commit=False),
    )

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http_client:
            yield http_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def live_server(client: AsyncClient) -> AsyncGenerator[str, None]:
    """
    The app on a real TCP port, for the one thing ASGITransport cannot do.

    httpx's ASGITransport buffers the entire response body before yielding a
    single line, so under it a streaming endpoint always runs to completion and a
    client cannot disconnect mid-answer. Testing the partial-save path needs a
    socket that can actually be closed early.

    Depends on `client` for its side effects, not its value: that fixture installs
    the `get_db` override and redirects `AsyncSessionLocal`, and uvicorn runs in
    this same process and event loop, so both apply to requests it serves.

    `lifespan="off"` skips the app's startup hook, which eagerly loads the ONNX
    embedding model. Nothing here embeds anything, and loading it would cost time
    and a few hundred MB per test run.
    """
    import uvicorn

    from app.main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="off")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())

    # port=0 means the OS picks one; it is only knowable after the socket is bound.
    while not server.started:
        await asyncio.sleep(0.02)
    port = server.servers[0].sockets[0].getsockname()[1]

    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task


@dataclass
class SeededUser:
    """A user that exists in the test database, plus the cookie that authenticates it."""

    id: str
    name: str
    email: str
    password: str
    cookies: dict[str, str]


@pytest_asyncio.fixture
async def make_user(db_session: AsyncSession):
    """
    Factory for users that exist in the database and can make authenticated requests.

    The session cookie is minted directly with `create_session` rather than by
    posting to /auth/login, so that a test about document ownership fails for
    ownership reasons and not because the login route changed.
    """
    from app.core.config import get_settings
    from app.core.security import create_session, hash_password
    from app.database.models import User

    default_password = "correct horse battery staple"

    async def _make(email: str, name: str = "Test User", password: str = default_password) -> SeededUser:
        user = User(name=name, email=email, password_hash=hash_password(password))
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return SeededUser(
            id=user.id,
            name=user.name,
            email=user.email,
            password=password,
            cookies={get_settings().auth_cookie_name: create_session(user.id)},
        )

    return _make


@pytest_asyncio.fixture
async def make_conversation(db_session: AsyncSession):
    """
    Factory for a conversation owned by `user_id`, optionally pre-filled with turns.

    `turns` is a list of (user_text, assistant_text) pairs, written in order with
    increasing timestamps so that `ORDER BY created_at` reproduces the thread. The
    explicit spacing matters: rows inserted in one transaction can otherwise share
    a timestamp to the microsecond, and the history loader would then be asserting
    against an arbitrary order.
    """
    from datetime import datetime, timedelta, timezone

    from app.database.models import Conversation, Message

    async def _make(
        user_id: str,
        *,
        title: str = "New Chat",
        mode: str = "docuquery",
        pinned: bool = False,
        turns: list[tuple[str, str]] | None = None,
    ) -> Conversation:
        base = datetime.now(timezone.utc) - timedelta(hours=1)
        conversation = Conversation(
            user_id=user_id, title=title, mode=mode, pinned=pinned,
            created_at=base, updated_at=base,
        )
        db_session.add(conversation)
        await db_session.flush()

        for index, (question, answer) in enumerate(turns or []):
            db_session.add(
                Message(
                    conversation_id=conversation.id, role="user", content=question,
                    status="complete", mode=mode,
                    created_at=base + timedelta(seconds=index * 2),
                )
            )
            db_session.add(
                Message(
                    conversation_id=conversation.id, role="assistant", content=answer,
                    status="complete", mode=mode,
                    created_at=base + timedelta(seconds=index * 2 + 1),
                )
            )

        await db_session.commit()
        await db_session.refresh(conversation)
        return conversation

    return _make


@pytest_asyncio.fixture
async def make_document(db_session: AsyncSession):
    """
    Factory for an indexed document with one embedded chunk, owned by `user_id`.

    The embedding is a fixed unit vector rather than a real one. These tests assert
    on which rows a query is allowed to reach, not on ranking quality, and a constant
    vector keeps the result order deterministic.
    """
    from app.database.models import EMBEDDING_DIM, Document, DocumentChunk, ProcessingStatus

    async def _make(
        user_id: str,
        filename: str = "owned.pdf",
        text: str = "The quarterly revenue figure was 4.2 million dollars.",
    ) -> Document:
        doc = Document(
            user_id=user_id,
            filename=filename,
            original_filename=filename,
            file_type="pdf",
            file_size=1024,
            storage_path=f"uploads/{filename}",
            status=ProcessingStatus.indexed,
            total_chunks=1,
        )
        db_session.add(doc)
        await db_session.flush()
        db_session.add(
            DocumentChunk(
                document_id=doc.id,
                chunk_index=0,
                page_number=1,
                text=text,
                embedding=[0.1] * EMBEDDING_DIM,
                metadata_={},
            )
        )
        await db_session.commit()
        await db_session.refresh(doc)
        return doc

    return _make
