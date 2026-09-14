"""switch embedding model to bge-small (768 -> 384 dims)

Revision ID: a9f3d6c1b5e8
Revises: c4f1a2b3d4e5
Create Date: 2026-09-14 00:00:00.000000
"""

from alembic import op
from pgvector.sqlalchemy import Vector

revision = "a9f3d6c1b5e8"
down_revision = "c4f1a2b3d4e5"
branch_labels = None
depends_on = None

OLD_DIM = 768
NEW_DIM = 384


def upgrade() -> None:
    # Existing vectors were produced by the old model and are not compatible
    # with the new one regardless of dimension, so they must be cleared before
    # the column can be resized. Chunk text/metadata rows are left untouched.
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
    op.execute("UPDATE document_chunks SET embedding = NULL")
    op.alter_column(
        "document_chunks",
        "embedding",
        type_=Vector(NEW_DIM),
        existing_nullable=True,
        postgresql_using="NULL",
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
    op.execute("UPDATE document_chunks SET embedding = NULL")
    op.alter_column(
        "document_chunks",
        "embedding",
        type_=Vector(OLD_DIM),
        existing_nullable=True,
        postgresql_using="NULL",
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )
