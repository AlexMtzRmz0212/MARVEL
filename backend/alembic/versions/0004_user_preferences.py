"""Add a preferences blob to users

Revision ID: 0004_user_preferences
Revises: 0003_expand_saga_taxonomy
Create Date: 2026-08-14

Accounts sync a handful of small display choices -- currently just whether
watched titles fade or hide in the catalog grid. A JSONB column rather than one
column per setting: each is a scalar with no query predicate over it, they ride
along inside the /api/auth/me response the SPA already fetches at boot, and the
next preference costs no migration at all. The payload is validated by a
pydantic schema on the way in, so "unstructured column" does not mean
unstructured data.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_user_preferences"
down_revision: str | None = "0003_expand_saga_taxonomy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferences")
