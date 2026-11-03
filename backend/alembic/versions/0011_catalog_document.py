"""The catalog moves into the database, and the editor gets a sign-in throttle

`catalog_document` holds the live catalog as one document, `catalog_history` the
documents it replaced, and `admin_attempts` the failed editor sign-ins. See
`app.models.catalog_document` for why the document is `json` rather than `jsonb`.

No data is inserted here. The first read of the editor imports the bundled
`mcu.json`, and until then the public API serves that file directly, so the
migration can run before, or without, a deploy.

Revision ID: 0011_catalog_document
Revises: 0010_watch_status_and_episodes
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_catalog_document"
down_revision: str | None = "0010_watch_status_and_episodes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_document",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("revision", sa.String(length=16), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("id = 1", name=op.f("ck_catalog_document_singleton")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_catalog_document")),
    )
    op.create_table(
        "catalog_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("revision", sa.String(length=16), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column(
            "saved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_catalog_history")),
    )
    op.create_table(
        "admin_attempts",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_admin_attempts")),
    )


def downgrade() -> None:
    op.drop_table("admin_attempts")
    op.drop_table("catalog_history")
    op.drop_table("catalog_document")
