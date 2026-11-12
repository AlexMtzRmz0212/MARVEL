"""Two more watch statuses: "watching" and "rewatch"

`status` was a verdict on a title that is *not* watched ("unseen", "unsure").
Two more are added, and one of them breaks that rule on purpose:

- "watching": started but not finished. Like the others it only describes a
  title with no `watched_at`.
- "rewatch": seen already, and wants seeing again. This is the exception: it
  sits *alongside* `watched_at`, because a title you need to rewatch still counts
  as watched -- progress, prerequisites and friends' comparisons all keep
  working off `watched_at` alone, and nothing else has to know the status exists.

The column is String(8); "watching" is exactly eight characters and "rewatch"
seven, so no widening is needed. Only the CHECK that closes the vocabulary moves.

Revision ID: 0012_watching_and_rewatch_status
Revises: 0011_catalog_document
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0012_watching_and_rewatch_status"
down_revision: str | None = "0011_catalog_document"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAME = op.f("ck_watch_progress_status_values")
OLD = ("unseen", "unsure")
NEW = ("unseen", "unsure", "watching", "rewatch")


def _in(values: tuple[str, ...]) -> str:
    return "status IS NULL OR status IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.drop_constraint(NAME, "watch_progress", type_="check")
    op.create_check_constraint(NAME, "watch_progress", _in(NEW))


def downgrade() -> None:
    # Rows holding a value the old vocabulary does not know would fail the CHECK.
    op.execute("UPDATE watch_progress SET status = NULL WHERE status IN ('watching', 'rewatch')")
    op.drop_constraint(NAME, "watch_progress", type_="check")
    op.create_check_constraint(NAME, "watch_progress", _in(OLD))
