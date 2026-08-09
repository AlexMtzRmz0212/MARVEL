from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Explicit naming templates so Alembic autogenerate emits stable, predictable
# constraint names. Without this, Postgres invents names for unnamed constraints
# and a later migration that wants to drop one has nothing reliable to name --
# the kind of problem that only surfaces around the fourth migration, when it is
# most annoying to fix.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
