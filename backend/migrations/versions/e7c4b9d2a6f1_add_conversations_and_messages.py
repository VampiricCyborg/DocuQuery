"""add conversations and messages for server-side chat history

Revision ID: e7c4b9d2a6f1
Revises: d5e2c8a7f1b3
Create Date: 2026-09-22 00:00:00.000000

Chats lived only in each browser's localStorage until now, so a thread vanished on
logout and never followed the account to another machine. These two tables move
them server-side.

Purely additive: two new tables and their indexes. Nothing existing is altered, so
`alembic upgrade head` on boot cannot disturb a running deployment's documents,
chunks or users. `downgrade()` drops both tables, which is the only possible inverse
of creating them -- it therefore discards every saved conversation. That is honest
rather than safe, and it is the reason the upgrade direction was kept additive: the
way out of a bad conversations schema is another migration, not this downgrade.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e7c4b9d2a6f1"
down_revision = "d5e2c8a7f1b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False, server_default="New Chat"),
        sa.Column("mode", sa.String(length=16), nullable=False, server_default="docuquery"),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Serves the sidebar's only query -- one user's threads, most recent first --
    # as an index-order scan rather than a filter plus sort.
    op.create_index(
        "ix_conversations_user_id_updated_at",
        "conversations",
        ["user_id", sa.text("updated_at DESC")],
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        # complete | partial | error -- see app/database/models.py:Message.
        # Deliberately a plain String rather than a native enum: adding a state to a
        # Postgres ENUM needs its own migration, and these states are application
        # vocabulary that is expected to grow.
        sa.Column("status", sa.String(length=16), nullable=False, server_default="complete"),
        sa.Column("mode", sa.String(length=16), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("citations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("steps", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("feedback", sa.String(length=8), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_messages_conversation_id_created_at",
        "messages",
        ["conversation_id", "created_at"],
    )


def downgrade() -> None:
    """
    Drop both tables, discarding every stored conversation and message.

    `messages` goes first. Its FK to `conversations` is ON DELETE CASCADE, which
    governs row deletes, not DROP TABLE -- Postgres refuses to drop a table another
    table still references unless CASCADE is spelled out, and dropping the dependent
    table first says the same thing without also silently dropping anything else that
    happens to depend on `conversations`.
    """
    op.drop_index("ix_messages_conversation_id_created_at", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversations_user_id_updated_at", table_name="conversations")
    op.drop_table("conversations")
