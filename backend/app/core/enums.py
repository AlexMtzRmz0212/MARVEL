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
    BLADE_TRILOGY = "Blade Trilogy"
    DEFENDERS_SAGA = "Defenders Saga"
    FOX_DAREDEVIL = "Fox Daredevil"
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
    """Marvel Comics Earth designations.

    Earth-199999, not Earth-616, is Marvel's official designation for the film
    universe -- 616 is the flagship comics continuity, a distinct branch. See
    `MCU_UNIVERSES` and migration 0005.
    """

    EARTH_199999 = "Earth-199999"
    EARTH_10005 = "Earth-10005"
    EARTH_12070 = "Earth-12070"
    MULTIVERSE_TVA = "Multiverse / TVA"
    EARTH_10005_AND_199999 = "Earth-10005 & 199999"
    EARTH_TRN554 = "Earth-TRN554"
    EARTH_199999_BRANCH = "Earth-199999 (Branch)"
    EARTH_92131 = "Earth-92131"
    EARTH_1610 = "Earth-1610"
    NON_CANON = "Non-Canon"
    EARTH_688 = "Earth-688"
    ANIMATED_MULTIVERSE = "Animated Multiverse"
    EARTH_121698 = "Earth-121698"
    EARTH_96283 = "Earth-96283"
    MULTIVERSE_EARTH_199999 = "Multiverse / Earth-199999"
    ALTERNATE_EARTH_199999 = "Alternate Earth / 199999"
    EARTH_199999_EARTH_838 = "Earth-199999 / Earth-838"
    EARTH_10005_2029 = "Earth-10005 (2029)"
    EARTH_26320 = "Earth-26320"
    EARTH_701306 = "Earth-701306"


# Earth-199999 and its direct branches/crossovers/multiverse-official designations.
# This is the single definition of "the MCU proper", and what `include_adjacent`
# filters on. `Tier` used to carry a second, weaker version of the same signal in
# its `ADJACENT` member; that member is gone, because a title's continuity is a
# fact about its universe and nothing else. See `Tier`.
MCU_UNIVERSES = frozenset(
    {
        Universe.EARTH_199999,
        Universe.EARTH_199999_BRANCH,
        Universe.MULTIVERSE_TVA,
        Universe.MULTIVERSE_EARTH_199999,
        Universe.ALTERNATE_EARTH_199999,
        Universe.EARTH_199999_EARTH_838,
        Universe.ANIMATED_MULTIVERSE,
        Universe.EARTH_10005_AND_199999,
    }
)


class MediaType(StrEnum):
    FILM = "film"
    SERIES = "series"
    SPECIAL = "special"


class Tier(StrEnum):
    """How necessary a title is to the through-line *of its own continuity*.

    The catalog is not one story. Its edge set is a couple of dozen disconnected
    components -- the MCU and everything wired into it, then Blade, then Fox's
    Daredevil, and so on -- so "the spine" below means the spine of whichever
    franchise the title belongs to, not one global one. `core` on `blade` and
    `core` on `iron-man` are claims about different spines.

    Distinct from `Strength`, which grades a single dependency edge. A title can
    be `CORE` in its own right while being only a `RECOMMENDED` prerequisite for
    some particular other title.

    There is deliberately no `ADJACENT` member. It used to mean "outside MCU
    continuity entirely", which is a fact about `universe`, not about how much
    the title matters -- and it only ever tagged two of the twenty-odd non-MCU
    titles, the rest of which were already graded on their own franchise. See
    `MCU_UNIVERSES`, which is what actually answers that question.
    """

    CORE = "core"  # the main spine; skipping it leaves a hole
    SUPPORTING = "supporting"  # meaningful, but the spine survives without it
    OPTIONAL = "optional"  # enjoyable, largely self-contained


class Strength(StrEnum):
    """How hard a dependency edge is."""

    ESSENTIAL = "essential"  # you will be lost without it
    RECOMMENDED = "recommended"  # richer with it, coherent without it


def sql_in(column: str, enum: type[StrEnum]) -> str:
    """Render a CHECK body pinning `column` to an enum's members.

    Generated from the enum so the constraint can never drift from the code.

    Apostrophes are doubled because at least one member genuinely contains one
    ("Sony's Spider-Man Universe"), and an unescaped quote closes the literal
    early and makes the whole CREATE TABLE unparseable. The migrations carry
    their own `_quoted_list()` doing the same thing -- this brings the metadata
    path in line with it.
    """
    escaped = [member.value.replace("'", "''") for member in enum]
    values = ", ".join(f"'{value}'" for value in escaped)
    return f"{column} IN ({values})"
