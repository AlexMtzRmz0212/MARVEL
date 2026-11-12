"""Widen the universe CHECK for Earth-828, home of The Fantastic Four: First Steps

Revision ID: 0014_earth_828
Revises: 0013_planned_status

Marvel designates the retro-futuristic Fantastic Four world Earth-828, not an
"Alternate Earth / 199999". The value is added to `app.core.enums.Universe`; this
widens the CHECK to match. Additive only: no row changes, and the downgrade only
fails while a title still uses the new value.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0014_earth_828"
down_revision: str | None = "0013_planned_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAME = op.f("ck_movies_universe")
OLD = (
    "Earth-199999",
    "Earth-10005",
    "Earth-12070",
    "Multiverse / TVA",
    "Earth-10005 & 199999",
    "Earth-TRN554",
    "Earth-199999 (Branch)",
    "Earth-92131",
    "Earth-1610",
    "Non-Canon",
    "Earth-688",
    "Animated Multiverse",
    "Earth-121698",
    "Earth-96283",
    "Multiverse / Earth-199999",
    "Alternate Earth / 199999",
    "Earth-199999 / Earth-838",
    "Earth-10005 (2029)",
    "Earth-26320",
    "Earth-701306",
)
NEW = OLD + ("Earth-828",)


def _in(values: tuple[str, ...]) -> str:
    return "universe IN (" + ", ".join("'" + v.replace("'", "''") + "'" for v in values) + ")"


def upgrade() -> None:
    op.drop_constraint(NAME, "movies", type_="check")
    op.create_check_constraint(NAME, "movies", _in(NEW))


def downgrade() -> None:
    op.drop_constraint(NAME, "movies", type_="check")
    op.create_check_constraint(NAME, "movies", _in(OLD))
