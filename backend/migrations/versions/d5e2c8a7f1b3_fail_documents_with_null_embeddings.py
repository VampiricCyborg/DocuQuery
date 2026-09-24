"""mark documents unsearchable when their chunks lost embeddings

Revision ID: d5e2c8a7f1b3
Revises: a9f3d6c1b5e8
Create Date: 2026-09-21 00:00:00.000000

Migration a9f3d6c1b5e8 switched the embedding model from bge-base (768 dims) to
bge-small (384 dims). Existing vectors were incompatible, so it ran

    UPDATE document_chunks SET embedding = NULL

but left `documents.status` alone. Every affected document therefore still reads
`indexed` while none of its chunks can be matched by a vector search: the UI
reports the file as ready, retrieval silently never returns it, and the user sees
an assistant that cannot find something it was told it had ingested.

a9f3d6c1b5e8 has already run in production, so it is not edited. This migration
corrects the state it left behind, which is the only safe direction.

Repairing the data is deliberately NOT part of this migration -- re-embedding
requires loading the ONNX model and re-reading the source files, which is not
work a migration should do while the application waits to boot. `status='failed'`
is the honest description of these rows, and backend/scripts/reindex.py rebuilds
them out of band.
"""

from alembic import op

revision = "d5e2c8a7f1b3"
down_revision = "a9f3d6c1b5e8"
branch_labels = None
depends_on = None


# A document is unsearchable if it claims to be indexed but holds at least one
# chunk with no embedding. Documents with no chunk rows at all are a different
# defect and are intentionally left alone here.
_AFFECTED = """
    id IN (
        SELECT DISTINCT document_id
        FROM document_chunks
        WHERE embedding IS NULL
    )
"""


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE documents
        SET status = 'failed'
        WHERE status = 'indexed'
          AND {_AFFECTED}
        """
    )


def downgrade() -> None:
    """
    Put the affected documents back to 'indexed'.

    This restores the state a9f3d6c1b5e8 left, which is the state this migration
    found -- not a healthy state. It is an honest inverse rather than a good one:
    the rows go back to claiming they are indexed while still holding NULL
    embeddings.

    The predicate is the same one `upgrade` selected on, so a document that failed
    for an unrelated reason (a parse error, say) keeps its status, because its
    chunks have embeddings or it has no chunks. The one case this cannot
    distinguish is a document that was genuinely 'failed' with NULL-embedding
    chunks before this migration ran; such a row is promoted to 'indexed' on
    downgrade. Re-running `upgrade` returns it to 'failed'.
    """
    op.execute(
        f"""
        UPDATE documents
        SET status = 'indexed'
        WHERE status = 'failed'
          AND {_AFFECTED}
        """
    )
