"""Triage status and per-episode progress on watch_progress

Two additions to the (user, title) row, both driven by the frontend learning to
say more than "watched or not":

`status` records a verdict for a title that is *not* watched: "unseen" (the
user is sure they have not seen it) or "unsure" (they cannot remember). It is
deliberately not a third spelling of "watched" -- `watched_at` already carries
that, and a second column holding the same fact would be a second thing to
keep in step. A row with `watched_at` set has `status` NULL; the API enforces
it and the CHECK below keeps the vocabulary closed.

`episodes_watched` is the list of 1-based episode numbers (within the catalog
entry, not within the TMDb season) ticked off for a series. JSONB rather than
an int[] so the SQLite test database can model it with the same JSON type the
preferences column uses.

Revision ID: 0010_watch_status_and_episodes
Revises: 0009_friendships
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_watch_status_and_episodes"
down_revision: str | None = "0009_friendships"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Duplicated from app.models.watch_progress rather than imported; see 0009.
STATUSES = ("unseen", "unsure")


def upgrade() -> None:
    op.add_column("watch_progress", sa.Column("status", sa.String(length=8), nullable=True))
    op.add_column(
        "watch_progress",
        sa.Column(
            "episodes_watched",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    allowed = ", ".join(f"'{value}'" for value in STATUSES)
    op.create_check_constraint(
        op.f("ck_watch_progress_status_values"),
        "watch_progress",
        f"status IS NULL OR status IN ({allowed})",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_watch_progress_status_values"), "watch_progress", type_="check")
    op.drop_column("watch_progress", "episodes_watched")
    op.drop_column("watch_progress", "status")
