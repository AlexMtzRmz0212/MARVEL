"""Retire tier='adjacent', which duplicated a fact the universe column owns

Revision ID: 0007_retire_adjacent_tier
Revises: 0006_blade_and_fox_daredevil
Create Date: 2026-08-26

`tier` originally doubled as the "is this the MCU" flag, with 'adjacent'
meaning outside MCU continuity entirely. Once Fox/Sony/Netflix titles started
being graded on their importance within their own franchise -- see the `Tier`
docstring -- that member stopped being a tier at all, and MCU_UNIVERSES became
the single answer to the continuity question. Only two rows still used it.

Both are remapped to 'core': X-Men: First Class and Days of Future Past are
spine titles of the Fox prequel run exactly as X-Men and X2 are of the original
one. The downgrade cannot know which rows were 'adjacent' before, so it widens
the CHECK without restoring any value -- lossy by nature, and harmless, since
nothing reads the member any more.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_retire_adjacent_tier"
down_revision: str | None = "0006_blade_and_fox_daredevil"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_TIERS = "'core', 'supporting', 'optional'"
OLD_TIERS = "'core', 'supporting', 'optional', 'adjacent'"


def upgrade() -> None:
    movies = sa.table("movies", sa.column("id", sa.String), sa.column("tier", sa.String))
    op.execute(movies.update().where(movies.c.tier == "adjacent").values(tier="core"))

    op.drop_constraint(op.f("ck_movies_tier"), "movies", type_="check")
    op.create_check_constraint(op.f("ck_movies_tier"), "movies", f"tier IN ({NEW_TIERS})")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_movies_tier"), "movies", type_="check")
    op.create_check_constraint(op.f("ck_movies_tier"), "movies", f"tier IN ({OLD_TIERS})")
