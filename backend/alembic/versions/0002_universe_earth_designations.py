"""Replace studio-based universe values with Marvel Comics Earth designations

Revision ID: 0002_universe_earth_designations
Revises: 0001_initial_schema
Create Date: 2026-08-09

The `universe` column used to name the production continuity a title belonged
to (mcu, sony, fox, netflix, abc). It now carries the specific in-universe
Earth designation instead (Earth-616, Earth-10005, Multiverse / TVA, ...),
per app.core.enums.Universe. The old five-value split between "MCU" and
"adjacent" continuities is superseded by the existing `tier` column, whose
'adjacent' value already carried that exact meaning.

Existing rows are backfilled by id using the same mapping applied to the seed
file, since the old broad categories have no formula for deriving the new,
more specific designation. Anything not covered by this catalog snapshot
(there should be nothing) falls back to 'Earth-616', the main continuity.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_universe_earth_designations"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# id -> new universe value, taken from backend/app/seed/data/mcu.json at the
# time this migration was written.
UNIVERSE_BY_ID = {
    "captain-america-the-first-avenger": "Earth-616",
    "agent-carter-one-shot": "Earth-616",
    "agent-carter-season-one": "Earth-616",
    "agent-carter-season-two": "Earth-616",
    "x-men-first-class": "Earth-10005",
    "the-fantastic-four-first-steps": "Alternate Earth / 616",
    "captain-marvel": "Earth-616",
    "iron-man": "Earth-616",
    "iron-man-2": "Earth-616",
    "the-incredible-hulk": "Earth-616",
    "thor": "Earth-616",
    "the-avengers": "Earth-616",
    "iron-man-3": "Earth-616",
    "thor-the-dark-world": "Earth-616",
    "captain-america-the-winter-soldier": "Earth-616",
    "guardians-of-the-galaxy": "Earth-616",
    "guardians-of-the-galaxy-vol-2": "Earth-616",
    "avengers-age-of-ultron": "Earth-616",
    "ant-man": "Earth-616",
    "captain-america-civil-war": "Earth-616",
    "black-widow": "Earth-616",
    "black-panther": "Earth-616",
    "spider-man-homecoming": "Earth-616",
    "doctor-strange": "Earth-616",
    "thor-ragnarok": "Earth-616",
    "ant-man-and-the-wasp": "Earth-616",
    "avengers-infinity-war": "Earth-616",
    "avengers-endgame": "Earth-616",
    "loki": "Multiverse / TVA",
    "what-if": "Animated Multiverse",
    "wandavision": "Earth-616",
    "the-falcon-and-the-winter-soldier": "Earth-616",
    "shang-chi-and-the-legend-of-the-ten-rings": "Earth-616",
    "eternals": "Earth-616",
    "spider-man-far-from-home": "Earth-616",
    "spider-man-no-way-home": "Earth-616",
    "doctor-strange-in-the-multiverse-of-madness": "Earth-616 / Earth-838",
    "hawkeye": "Earth-616",
    "moon-knight": "Earth-616",
    "ms-marvel": "Earth-616",
    "thor-love-and-thunder": "Earth-616",
    "she-hulk-attorney-at-law": "Earth-616",
    "werewolf-by-night": "Earth-616",
    "black-panther-wakanda-forever": "Earth-616",
    "the-guardians-of-the-galaxy-holiday-special": "Earth-616",
    "ant-man-and-the-wasp-quantumania": "Earth-616",
    "guardians-of-the-galaxy-vol-3": "Earth-616",
    "secret-invasion": "Earth-616",
    "loki-season-2": "Multiverse / TVA",
    "echo": "Earth-616",
    "the-marvels": "Earth-616",
    "agatha-all-along": "Earth-616",
    "deadpool-and-wolverine": "Earth-10005 & 616",
    "captain-america-brave-new-world": "Earth-616",
    "daredevil-born-again": "Earth-616",
    "thunderbolts": "Earth-616",
    "ironheart": "Earth-616",
    "wonder-man": "Earth-616",
}

NEW_UNIVERSES = (
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

OLD_UNIVERSES = ("mcu", "sony", "fox", "netflix", "abc")


def _quoted_list(values: tuple[str, ...]) -> str:
    escaped = [v.replace("'", "''") for v in values]
    return ", ".join(f"'{v}'" for v in escaped)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_movies_universe"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("universe", sa.String))
    for movie_id, universe in UNIVERSE_BY_ID.items():
        op.execute(
            movies.update().where(movies.c.id == movie_id).values(universe=universe)
        )
    # Belt and braces: any row this migration's snapshot doesn't know about
    # (there should be none) still needs to satisfy the new constraint.
    op.execute(
        sa.text(
            f"UPDATE movies SET universe = 'Earth-616' "
            f"WHERE universe IN ({_quoted_list(OLD_UNIVERSES)})"
        )
    )

    op.create_check_constraint(
        op.f("ck_movies_universe"), "movies", f"universe IN ({_quoted_list(NEW_UNIVERSES)})"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_movies_universe"), "movies", type_="check")

    movies = sa.table("movies", sa.column("id", sa.String), sa.column("universe", sa.String))
    fox_ids = [movie_id for movie_id, u in UNIVERSE_BY_ID.items() if u.startswith("Earth-10005")]
    if fox_ids:
        op.execute(movies.update().where(movies.c.id.in_(fox_ids)).values(universe="fox"))
    op.execute(
        sa.text(
            f"UPDATE movies SET universe = 'mcu' "
            f"WHERE universe NOT IN ({_quoted_list(OLD_UNIVERSES)})"
        )
    )

    op.create_check_constraint(
        op.f("ck_movies_universe"), "movies", f"universe IN ({_quoted_list(OLD_UNIVERSES)})"
    )
