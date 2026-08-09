"""Domain vocabulary, shared by the ORM models and the API schemas.

These are deliberately stored as `String` + `CHECK` in Postgres rather than as
native enum types. Sagas and universes grow over time, and widening a CHECK is a
one-line migration, whereas `ALTER TYPE ... ADD VALUE` is awkward for Alembic to
autogenerate and cannot run inside a transaction block. The type safety that
actually matters -- rejecting a bad value from a request or a seed file -- lives
at the API boundary, where these enums are used directly.
"""

from __future__ import annotations

from enum import StrEnum


class Saga(StrEnum):
    INFINITY = "infinity"
    MULTIVERSE = "multiverse"
    NONE = "none"  # titles outside the MCU's saga structure


class Universe(StrEnum):
    """Which production continuity a title belongs to."""

    MCU = "mcu"
    SONY = "sony"  # Raimi/Webb Spider-Man, Venom, Morbius
    FOX = "fox"  # X-Men, Deadpool, Fantastic Four
    NETFLIX = "netflix"  # Daredevil, Jessica Jones, the Defenders
    # Agents of S.H.I.E.L.D., Inhumans. Note that Agent Carter is filed under
    # MCU rather than here: `include_adjacent=False` hides everything that is
    # not `MCU`, and Agent Carter sits inside the main narrative continuity even
    # though ABC produced it. This axis is really about which studio's continuity
    # a title belongs to, and the Marvel Television shows straddle that line.
    ABC = "abc"


class MediaType(StrEnum):
    FILM = "film"
    SERIES = "series"
    SPECIAL = "special"


class Tier(StrEnum):
    """How necessary a title is to the through-line.

    Distinct from `Strength`, which grades a single dependency edge. A title can
    be `CORE` in its own right while being only a `RECOMMENDED` prerequisite for
    some particular other title.
    """

    CORE = "core"  # the main spine; skipping it leaves a hole
    SUPPORTING = "supporting"  # meaningful, but the spine survives without it
    OPTIONAL = "optional"  # enjoyable, largely self-contained
    ADJACENT = "adjacent"  # outside MCU continuity entirely


class Strength(StrEnum):
    """How hard a dependency edge is."""

    ESSENTIAL = "essential"  # you will be lost without it
    RECOMMENDED = "recommended"  # richer with it, coherent without it


def sql_in(column: str, enum: type[StrEnum]) -> str:
    """Render a CHECK body pinning `column` to an enum's members.

    Generated from the enum so the constraint can never drift from the code.
    """
    values = ", ".join(f"'{member.value}'" for member in enum)
    return f"{column} IN ({values})"
