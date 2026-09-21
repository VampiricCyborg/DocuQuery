"""
Shared pytest fixtures.

The bulk of this suite runs against mocks and needs no services. The fixtures below
add a second tier: tests marked `@pytest.mark.integration` run against a real
PostgreSQL database with the pgvector extension, so that SQL, constraints, cascades
and the ownership filters in the query layer are actually exercised.

Integration tests are opt-in via TEST_DATABASE_URL. When it is unset every
integration test is skipped, so `pytest -q` on a laptop with no database behaves
exactly as it did before. CI sets it to a pgvector/pgvector:pg16 service container.

    # local
    docker run -d --name docuquery-test-db -p 5433:5432 \
        -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=docuquery_test \
        pgvector/pgvector:pg16
    export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/docuquery_test
    pytest -q -m integration
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Tables emptied between integration tests. Ordering is irrelevant because the
# TRUNCATE is a single statement with CASCADE, but document_chunks is listed first
# to make the dependency direction obvious to a reader.
_TRUNCATE_TABLES = ("document_chunks", "documents", "users")

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
async def db_session(migrated_database: str) -> AsyncGenerator[AsyncSession, None]:
    """A session against the migrated test database, with the tables emptied first."""
    # NullPool: each test gets its own connections and disposes of them, rather than
    # leaving pooled ones open against a container that the next test truncates.
    engine = create_async_engine(migrated_database, poolclass=NullPool)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE"))
    try:
        async with sessionmaker() as session:
            yield session
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    An HTTP client bound to the real test database.

    `get_db` is overridden to hand every request the one session the test also holds,
    so a row the test writes is visible to the request and vice versa.
    """
    from app.api.dependencies import get_db
    from app.main import app

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http_client:
            yield http_client
    finally:
        app.dependency_overrides.pop(get_db, None)
