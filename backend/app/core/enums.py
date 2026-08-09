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
    """Marvel Comics Earth designations."""

    EARTH_616 = "Earth-616"
    EARTH_10005 = "Earth-10005"
    EARTH_12070 = "Earth-12070"
    MULTIVERSE_TVA = "Multiverse / TVA"
    EARTH_10005_AND_616 = "Earth-10005 & 616"
    EARTH_TRN554 = "Earth-TRN554"
    EARTH_616_BRANCH = "Earth-616 (Branch)"
    EARTH_92131 = "Earth-92131"
    EARTH_1610 = "Earth-1610"
    NON_CANON = "Non-Canon"
    EARTH_688 = "Earth-688"
    ANIMATED_MULTIVERSE = "Animated Multiverse"
    EARTH_121698 = "Earth-121698"
    EARTH_96283 = "Earth-96283"
    MULTIVERSE_EARTH_616 = "Multiverse / Earth-616"
    ALTERNATE_EARTH_616 = "Alternate Earth / 616"
    EARTH_616_EARTH_838 = "Earth-616 / Earth-838"
    EARTH_10005_2029 = "Earth-10005 (2029)"


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
