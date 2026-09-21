"""
Migration d5e2c8a7f1b3, executed against a real database.

A migration that is only ever read is not known to work. This drives the actual
Alembic CLI over real rows: it seeds the exact state a9f3d6c1b5e8 left behind --
a document marked `indexed` whose chunk has no embedding -- then runs
upgrade -> downgrade -> upgrade and asserts the status at each step.

The round trip matters as much as the upgrade. railway.json runs
`alembic upgrade head` on every boot, so a migration that cannot be reversed
leaves no way back except a database restore.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.database.models import Document, DocumentChunk, ProcessingStatus

from .conftest import run_alembic

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

# The revision immediately before the one under test.
PREVIOUS_REVISION = "a9f3d6c1b5e8"
TARGET_REVISION = "d5e2c8a7f1b3"


async def _seed_stranded_document(db_session, *, filename: str, embedding) -> str:
    """A document claiming to be indexed, with one chunk whose embedding is `embedding`."""
    doc = Document(
        filename=filename,
        original_filename=filename,
        file_type="pdf",
        file_size=2048,
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
            text="Revenue for the period was 4.2 million dollars.",
            embedding=embedding,
            metadata_={},
        )
    )
    await db_session.commit()
    return doc.id


async def _status_of(db_session, doc_id: str) -> str:
    # Read through raw SQL: the migration changes the row underneath the session,
    # and the ORM identity map would otherwise hand back the stale object.
    return await db_session.scalar(
        text("SELECT status::text FROM documents WHERE id = :id"), {"id": doc_id}
    )


async def test_upgrade_downgrade_upgrade_round_trip(db_session, migrated_database):
    from app.database.models import EMBEDDING_DIM

    stranded = await _seed_stranded_document(db_session, filename="stranded.pdf", embedding=None)
    healthy = await _seed_stranded_document(
        db_session, filename="healthy.pdf", embedding=[0.1] * EMBEDDING_DIM
    )

    try:
        # The database is already at head, so step back over the migration first to
        # observe the state it is meant to correct.
        run_alembic("downgrade", PREVIOUS_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, stranded) == "indexed"

        run_alembic("upgrade", TARGET_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, stranded) == "failed", (
            "a document whose chunks lost their embeddings must stop claiming to be indexed"
        )
        assert await _status_of(db_session, healthy) == "indexed", (
            "a document with real embeddings must be left alone"
        )

        run_alembic("downgrade", PREVIOUS_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, stranded) == "indexed", (
            "downgrade must restore the previous status"
        )
        assert await _status_of(db_session, healthy) == "indexed"

        run_alembic("upgrade", TARGET_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, stranded) == "failed", (
            "re-applying must be deterministic, not accumulate state"
        )
    finally:
        # Whatever happened above, leave the database at head for the other tests.
        run_alembic("upgrade", "head", database_url=migrated_database)


async def test_upgrade_leaves_unrelated_failures_alone(db_session, migrated_database):
    """
    A document that failed to parse has no chunks at all. The migration selects on
    NULL-embedding chunk rows, so it must not touch one, in either direction.
    """
    doc = Document(
        filename="unparseable.pdf",
        original_filename="unparseable.pdf",
        file_type="pdf",
        file_size=10,
        storage_path="uploads/unparseable.pdf",
        status=ProcessingStatus.failed,
        total_chunks=0,
    )
    db_session.add(doc)
    await db_session.commit()

    try:
        run_alembic("downgrade", PREVIOUS_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, doc.id) == "failed", (
            "downgrade must not promote a genuinely failed document to indexed"
        )

        run_alembic("upgrade", TARGET_REVISION, database_url=migrated_database)
        assert await _status_of(db_session, doc.id) == "failed"
    finally:
        run_alembic("upgrade", "head", database_url=migrated_database)


async def test_every_migration_reverses_all_the_way_to_base(migrated_database):
    """
    `downgrade base` then `upgrade head` over the whole chain.

    This is the check that catches a migration whose downgrade was never written or
    never run -- the cheapest possible guard on a project where every deploy runs
    `alembic upgrade head` automatically.
    """
    try:
        run_alembic("downgrade", "base", database_url=migrated_database)
        run_alembic("upgrade", "head", database_url=migrated_database)
    finally:
        run_alembic("upgrade", "head", database_url=migrated_database)


async def test_chunk_rows_survive_the_round_trip(db_session, migrated_database):
    """The migration only rewrites `status`; it must not drop or alter chunk data."""
    from app.database.models import EMBEDDING_DIM

    doc_id = await _seed_stranded_document(
        db_session, filename="preserved.pdf", embedding=[0.2] * EMBEDDING_DIM
    )

    try:
        run_alembic("downgrade", PREVIOUS_REVISION, database_url=migrated_database)
        run_alembic("upgrade", TARGET_REVISION, database_url=migrated_database)

        chunks = (
            await db_session.execute(
                select(DocumentChunk).where(DocumentChunk.document_id == doc_id)
            )
        ).scalars().all()
        assert len(chunks) == 1
        assert chunks[0].text.startswith("Revenue for the period")
        assert chunks[0].embedding is not None
    finally:
        run_alembic("upgrade", "head", database_url=migrated_database)
