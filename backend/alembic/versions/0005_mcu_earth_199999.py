"""Correct the MCU-proper universe designation from Earth-616 to Earth-199999

Revision ID: 0005_mcu_earth_199999
Revises: 0004_user_preferences
Create Date: 2026-08-26

0002 replaced the studio-based universe values with Marvel Comics Earth
designations, but mistagged the film/TV universe as Earth-616. That's the
flagship comics continuity -- a distinct thing. Marvel's own multiverse
numbering designates the film universe Earth-199999. This is a literal 1:1
rename of the five "616" values (and their composites) to their "199999"
equivalents, per app.core.enums.Universe; no title is reclassified.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_mcu_earth_199999"
down_revision: str | None = "0004_user_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Order matters: composites containing "Earth-616" as a substring must be
# remapped before the bare "Earth-616" -> "Earth-199999" rename runs.
OLD_TO_NEW = {
    "Earth-616 (Branch)": "Earth-199999 (Branch)",
    "Earth-616 / Earth-838": "Earth-199999 / Earth-838",
    "Multiverse / Earth-616": "Multiverse / Earth-199999",
    "Alternate Earth / 616": "Alternate Earth / 199999",
    "Earth-10005 & 616": "Earth-10005 & 199999",
    "Earth-616": "Earth-199999",
}

NEW_UNIVERSES = (
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
)

OLD_UNIVERSES = (
    "Earth-616",
    "Earth-10005",
    "Earth-12070",
    "Multiverse / TVA",
    "Earth-10005 & 616",
    "Earth-TRN554",
    "Earth-616 (Branch)",
    "Earth-92131",
    "Earth-1610",
    "Non-Canon",
    "Earth-688",
    "Animated Multiverse",
    "Earth-121698",
    "Earth-96283",
    "Multiverse / Earth-616",
    "Alternate Earth / 616",
    "Earth-616 / Earth-838",
    "Earth-10005 (2029)",
)


def _quoted_list(values: tuple[str, ...]) -> str:
    escaped = [v.replace("'", "''") for v in values]
    return ", ".join(f"'{v}'" for v in escaped)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_movies_universe"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("universe", sa.String))
    for old, new in OLD_TO_NEW.items():
        op.execute(movies.update().where(movies.c.universe == old).values(universe=new))

    op.create_check_constraint(
        op.f("ck_movies_universe"), "movies", f"universe IN ({_quoted_list(NEW_UNIVERSES)})"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_movies_universe"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("universe", sa.String))
    for old, new in OLD_TO_NEW.items():
        op.execute(movies.update().where(movies.c.universe == new).values(universe=old))

    op.create_check_constraint(
        op.f("ck_movies_universe"), "movies", f"universe IN ({_quoted_list(OLD_UNIVERSES)})"
    )
