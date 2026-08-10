"""Expand the saga column from a 3-value MCU-only split to a full franchise taxonomy

Revision ID: 0003_expand_saga_taxonomy
Revises: 0002_universe_earth_designations
Create Date: 2026-08-10

The `saga` column used to carry exactly three values: 'infinity', 'multiverse'
and 'none' -- adequate while the catalog only tracked MCU canon. Now that
tier='adjacent' titles carry their own franchise (Fox X-Men, Sony's Spider-Man
Universe, the Raimi/Webb trilogies, Trank/Story F4, Spider-Verse, Defenders,
Animated Multiverse, ...), per app.core.enums.Saga, a single 'none' bucket no
longer says anything useful.

This is a literal 1:1 remap of the three old values -- 'infinity' ->
'Infinity Saga', 'multiverse' -> 'Multiverse Saga', 'none' -> 'N/A' -- not a
per-title reclassification. Existing adjacent titles land on 'N/A' and are
expected to be re-tagged with their actual franchise by hand (via the
Streamlit catalog editor) after this migration runs; the same is true of the
`app.seed.data.mcu.json` snapshot's 'none' rows.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_expand_saga_taxonomy"
down_revision: str | None = "0002_universe_earth_designations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_TO_NEW = {
    "infinity": "Infinity Saga",
    "multiverse": "Multiverse Saga",
    "none": "N/A",
}

NEW_SAGAS = (
    "Animated Multiverse",
    "Defenders Saga",
    "Fox X-Men Saga",
    "Infinity Saga",
    "Infinity Saga Era",
    "Multiverse Saga",
    "Multiverse Era",
    "N/A",
    "Raimi Trilogy",
    "Sony's Spider-Man Universe",
    "Spider-Verse Saga",
    "Story F4 Duology",
    "Trank F4",
    "Webb Spider-Man",
)

OLD_SAGAS = ("infinity", "multiverse", "none")


def _quoted_list(values: tuple[str, ...]) -> str:
    escaped = [v.replace("'", "''") for v in values]
    return ", ".join(f"'{v}'" for v in escaped)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_movies_saga"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("saga", sa.String))
    for old, new in OLD_TO_NEW.items():
        op.execute(movies.update().where(movies.c.saga == old).values(saga=new))

    op.create_check_constraint(
        op.f("ck_movies_saga"), "movies", f"saga IN ({_quoted_list(NEW_SAGAS)})"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_movies_saga"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("saga", sa.String))
    for old, new in OLD_TO_NEW.items():
        op.execute(movies.update().where(movies.c.saga == new).values(saga=old))
    # Anything hand-retagged since the upgrade (a specific franchise instead
    # of 'N/A') has no old-schema equivalent -- fall back to 'none'.
    op.execute(
        sa.text(f"UPDATE movies SET saga = 'none' WHERE saga NOT IN ({_quoted_list(OLD_SAGAS)})")
    )

    op.create_check_constraint(
        op.f("ck_movies_saga"), "movies", f"saga IN ({_quoted_list(OLD_SAGAS)})"
    )
