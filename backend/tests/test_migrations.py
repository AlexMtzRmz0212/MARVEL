"""What only a real Postgres can prove.

The API suite runs against in-memory SQLite, which is enough for behaviour but
cannot check three things that matter here: that the Alembic chain actually
applies, that the deferrable unique constraints are real, and that the ORM
metadata and the migrations describe the same schema. Those need the database
production uses, so they live behind a marker and a TEST_DATABASE_URL.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.postgres

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytest.importorskip("psycopg")
if not DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_engine(DATABASE_URL)
    yield engine
    engine.dispose()


def test_migrations_produce_every_table(pg_engine):
    tables = set(inspect(pg_engine).get_table_names())
    assert {
        "movies",
        "prerequisites",
        "users",
        "custom_orders",
        "custom_order_items",
        "watch_progress",
    } <= tables


def test_the_preferences_column_is_jsonb(pg_engine):
    columns = {c["name"]: c for c in inspect(pg_engine).get_columns("users")}
    assert "preferences" in columns
    assert columns["preferences"]["type"].__class__.__name__ == "JSONB"


def test_the_position_constraint_is_deferrable(pg_engine):
    """The reorder path does not rely on this, but the schema still promises it.

    _replace_items deletes before inserting precisely so it works either way;
    this asserts the migration produced what app/models/custom_order.py
    declares, which is the half SQLite cannot check.
    """
    with pg_engine.connect() as connection:
        deferrable = connection.execute(
            text(
                """
                SELECT condeferrable
                FROM pg_constraint
                WHERE conrelid = 'custom_order_items'::regclass
                  AND contype = 'u'
                """
            )
        ).scalars().all()

    assert deferrable == [True]


def test_the_saga_check_survives_an_apostrophe(pg_engine):
    """Sony's Spider-Man Universe is the reason sql_in escapes quotes."""
    with pg_engine.connect() as connection:
        definition = connection.execute(
            text(
                """
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'movies'::regclass AND conname = 'ck_movies_saga'
                """
            )
        ).scalar_one()

    assert "Sony''s Spider-Man Universe" in definition
