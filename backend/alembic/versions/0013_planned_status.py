"""A watch status for titles you want to watch: "planned"

Sits with "unseen", "unsure" and "watching" as a verdict on a title that is *not*
watched: it is dropped when `watched_at` is set, like they are. "planned" is
seven characters, so the String(8) column does not need widening; only the CHECK
that closes the vocabulary moves.

Revision ID: 0013_planned_status
Revises: 0012_watching_and_rewatch_status
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0013_planned_status"
down_revision: str | None = "0012_watching_and_rewatch_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAME = op.f("ck_watch_progress_status_values")
OLD = ("unseen", "unsure", "watching", "rewatch")
NEW = ("unseen", "unsure", "watching", "planned", "rewatch")


def _in(values: tuple[str, ...]) -> str:
    return "status IS NULL OR status IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.drop_constraint(NAME, "watch_progress", type_="check")
    op.create_check_constraint(NAME, "watch_progress", _in(NEW))


def downgrade() -> None:
    # Rows holding a value the old vocabulary does not know would fail the CHECK.
    op.execute("UPDATE watch_progress SET status = NULL WHERE status = 'planned'")
    op.drop_constraint(NAME, "watch_progress", type_="check")
    op.create_check_constraint(NAME, "watch_progress", _in(OLD))
