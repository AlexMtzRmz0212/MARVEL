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
    """The branded saga or franchise a title belongs to.

    Only Infinity Saga / Multiverse Saga carry phase semantics (see
    `test_phase_and_saga_agree`); the rest are franchise tags -- most for
    titles outside Earth-616 entirely (see `MCU_UNIVERSES`), but a few
    ('Infinity Saga Era', 'Multiverse Era', 'Defenders Saga') for Earth-616
    stories Marvel Studios itself didn't produce or number into a phase.
    """

    ANIMATED_MULTIVERSE = "Animated Multiverse"
    DEFENDERS_SAGA = "Defenders Saga"
    FOX_X_MEN_SAGA = "Fox X-Men Saga"
    INFINITY_SAGA = "Infinity Saga"
    INFINITY_SAGA_ERA = "Infinity Saga Era"
    MULTIVERSE_SAGA = "Multiverse Saga"
    MULTIVERSE_ERA = "Multiverse Era"
    NA = "N/A"
    RAIMI_TRILOGY = "Raimi Trilogy"
    SONY_SPIDER_MAN_UNIVERSE = "Sony's Spider-Man Universe"
    SPIDER_VERSE_SAGA = "Spider-Verse Saga"
    STORY_F4_DUOLOGY = "Story F4 Duology"
    TRANK_F4 = "Trank F4"
    WEBB_SPIDER_MAN = "Webb Spider-Man"


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


# Earth-616 and its direct branches/crossovers/multiverse-official designations --
# what "the MCU proper" means once tier stopped doubling as that signal (tier now
# also grades adjacent-universe titles by importance within their own franchise,
# per the curated table; see `Tier`). This is what `include_adjacent` filters on.
MCU_UNIVERSES = frozenset(
    {
        Universe.EARTH_616,
        Universe.EARTH_616_BRANCH,
        Universe.MULTIVERSE_TVA,
        Universe.MULTIVERSE_EARTH_616,
        Universe.ALTERNATE_EARTH_616,
        Universe.EARTH_616_EARTH_838,
        Universe.ANIMATED_MULTIVERSE,
        Universe.EARTH_10005_AND_616,
    }
)


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
