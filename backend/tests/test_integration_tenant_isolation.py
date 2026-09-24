"""
Tenant isolation, against a real database.

Every document route and /retrieve scopes its query with `Document.user_id ==
current_user.id`. Until now nothing executed that SQL: the rest of the suite hands
the routes an AsyncMock, which returns whatever the test told it to return, so a
query that had dropped its ownership filter would pass exactly as happily as one
that had not.

These tests seed two real users, give user A a real document with a real chunk,
and assert that user B cannot reach it through any route that takes a document id
-- and that a cross-tenant read is a 404, never a 403. 403 would confirm the
document exists, which is itself a disclosure: it turns an opaque id into an
oracle for "is this a real document belonging to someone else".
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.database.models import EMBEDDING_DIM

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest.fixture
def stub_query_embedding():
    """
    Replace query embedding with a constant vector.

    /retrieve would otherwise load the ONNX model, which takes seconds and tests
    nothing here. The vector search, its ownership filter and the SQL around it all
    still run for real -- only the encoder is stubbed.
    """
    with patch(
        "app.retrieval.retrieval_pipeline.embed_query",
        return_value=[0.1] * EMBEDDING_DIM,
    ) as stub:
        yield stub


async def test_document_list_shows_only_the_callers_documents(client, make_user, make_document):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    await make_document(alice.id, filename="alice-report.pdf")
    await make_document(bob.id, filename="bob-notes.pdf")

    response = await client.get("/documents", cookies=bob.cookies)

    assert response.status_code == 200
    filenames = [doc["filename"] for doc in response.json()]
    assert filenames == ["bob-notes.pdf"]


async def test_reading_another_users_document_is_404(client, make_user, make_document):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    doc = await make_document(alice.id)

    response = await client.get(f"/documents/{doc.id}", cookies=bob.cookies)

    assert response.status_code == 404, "a cross-tenant read must not confirm the document exists"


async def test_reading_another_users_chunks_is_404(client, make_user, make_document):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    doc = await make_document(alice.id)

    response = await client.get(f"/documents/{doc.id}/chunks", cookies=bob.cookies)

    assert response.status_code == 404


async def test_reading_another_users_debug_diagnostics_is_404(client, make_user, make_document):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    doc = await make_document(alice.id)

    response = await client.get(f"/documents/{doc.id}/debug", cookies=bob.cookies)

    assert response.status_code == 404


async def test_deleting_another_users_document_is_404_and_leaves_it_intact(
    client, make_user, make_document
):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    doc = await make_document(alice.id)

    response = await client.delete(f"/documents/{doc.id}", cookies=bob.cookies)
    assert response.status_code == 404

    # The 404 must mean "nothing happened", not "deleted, then reported missing".
    still_there = await client.get(f"/documents/{doc.id}", cookies=alice.cookies)
    assert still_there.status_code == 200


async def test_retrieval_never_returns_another_users_chunks(
    client, make_user, make_document, stub_query_embedding
):
    alice = await make_user("alice@example.com")
    bob = await make_user("bob@example.com")
    await make_document(
        alice.id,
        filename="alice-secret.pdf",
        text="The acquisition price agreed in private was 900 million dollars.",
    )

    response = await client.post(
        "/retrieve", json={"query": "acquisition price"}, cookies=bob.cookies
    )

    # Bob owns nothing, so retrieval finds nothing. Either a 404 from the
    # no-results path or an empty 200 is acceptable; a chunk of Alice's is not.
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        body = response.json()
        assert body["chunks"] == []
        assert "900 million" not in body.get("context", "")


async def test_retrieval_returns_the_callers_own_chunks(
    client, make_user, make_document, stub_query_embedding
):
    """
    The counterpart to the test above.

    Without this, every isolation assertion would still pass if retrieval were
    broken outright and returned nothing to anybody.
    """
    alice = await make_user("alice@example.com")
    await make_document(
        alice.id,
        filename="alice-report.pdf",
        text="The acquisition price agreed in private was 900 million dollars.",
    )

    response = await client.post(
        "/retrieve", json={"query": "acquisition price"}, cookies=alice.cookies
    )

    assert response.status_code == 200
    body = response.json()
    assert body["chunks"], "the owner must still be able to retrieve their own chunk"
    assert any("900 million" in chunk["text"] for chunk in body["chunks"])


async def test_deleting_a_user_cascades_to_documents_and_chunks(
    client, db_session, make_user, make_document
):
    """
    The FK cascades are declared in the ORM and the migration. Nothing had ever
    executed them, so this asserts the database really drops the dependent rows
    rather than raising a foreign-key violation or orphaning chunks.
    """
    from sqlalchemy import func, select

    from app.database.models import Document, DocumentChunk, User

    alice = await make_user("alice@example.com")
    await make_document(alice.id)

    await db_session.execute(
        User.__table__.delete().where(User.id == alice.id)
    )
    await db_session.commit()

    remaining_docs = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.user_id == alice.id)
    )
    remaining_chunks = await db_session.scalar(select(func.count()).select_from(DocumentChunk))

    assert remaining_docs == 0
    assert remaining_chunks == 0
