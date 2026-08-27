"""Widen the saga and universe CHECKs for the Blade trilogy and Fox's Daredevil

Revision ID: 0006_blade_and_fox_daredevil
Revises: 0005_mcu_earth_199999
Create Date: 2026-08-26

Blade (1998-2004) and Fox's Daredevil/Elektra were the two pre-MCU Marvel
franchises the catalog had no vocabulary for: New Line's Blade lives in
Earth-26320 and the Daredevil duology in Earth-701306, and neither fits any
existing saga tag. This adds two saga values and two universe values, per
app.core.enums. No existing row changes -- both CHECKs are widened only, so the
upgrade is additive and the downgrade only fails if titles using the new values
are still present.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_blade_and_fox_daredevil"
down_revision: str | None = "0005_mcu_earth_199999"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ADDED_SAGAS = ("Blade Trilogy", "Fox Daredevil")
ADDED_UNIVERSES = ("Earth-26320", "Earth-701306")

OLD_SAGAS = (
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

OLD_UNIVERSES = (
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

NEW_SAGAS = tuple(sorted(OLD_SAGAS + ADDED_SAGAS))
NEW_UNIVERSES = OLD_UNIVERSES + ADDED_UNIVERSES


def _quoted_list(values: tuple[str, ...]) -> str:
    escaped = [v.replace("'", "''") for v in values]
    return ", ".join(f"'{v}'" for v in escaped)


def _recreate(saga_values: tuple[str, ...], universe_values: tuple[str, ...]) -> None:
    op.drop_constraint(op.f("ck_movies_saga"), "movies", type_="check")
    op.create_check_constraint(
        op.f("ck_movies_saga"), "movies", f"saga IN ({_quoted_list(saga_values)})"
    )
    op.drop_constraint(op.f("ck_movies_universe"), "movies", type_="check")
    op.create_check_constraint(
        op.f("ck_movies_universe"), "movies", f"universe IN ({_quoted_list(universe_values)})"
    )


def upgrade() -> None:
    _recreate(NEW_SAGAS, NEW_UNIVERSES)


def downgrade() -> None:
    # Deliberately no data remap: there is nothing to demote these titles to.
    # Reseed without them first, or the narrowed CHECK will refuse to validate.
    _recreate(OLD_SAGAS, OLD_UNIVERSES)
