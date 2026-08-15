"""Fixtures for API tests.

Two kinds of test live here. The catalog tests need no database at all -- the
read-only API serves the curated JSON file -- so the `client` fixture stays
exactly as infrastructure-free as it always was.

The account tests need per-user storage, and get it from an in-memory SQLite
database built from the ORM metadata. SQLite rather than a real Postgres
because CI has no database service and this suite has to run on a laptop with
nothing installed; the models were written with that in mind (`sqlalchemy.Uuid`
renders as CHAR(32) here and native uuid there). What SQLite cannot exercise --
the deferrable constraints, JSONB, the migration chain itself -- is what the
separate Postgres CI job is for.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import UniqueConstraint, create_engine, event, insert
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.catalog import get_catalog
from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Importing for the side effect of registering the mappers: Base.metadata is
# only complete once every model module has been imported.
from app.models import custom_order, user, watch_progress  # noqa: F401
from app.models.movie import Movie


@event.listens_for(Base.metadata, "before_create")
def _strip_deferrable_on_sqlite(target, connection, **kwargs) -> None:
    """SQLite cannot parse DEFERRABLE outside a foreign-key clause.

    Three table-level UNIQUE constraints declare it -- the two order columns on
    `movies` and (order_id, position) on `custom_order_items`. Postgres keeps
    them; here they become plain unique constraints, which is strictly stricter,
    so nothing under test gets an easier ride. The order-rewrite code path
    deliberately does not rely on deferral anyway (see _replace_items), and this
    fixture is what proves that claim.
    """
    if connection.dialect.name != "sqlite":
        return
    for table in target.tables.values():
        for constraint in table.constraints:
            if isinstance(constraint, UniqueConstraint):
                constraint.deferrable = None
                constraint.initially = None


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    test_engine = create_engine(
        "sqlite://",
        # One shared in-memory database across every connection. Without
        # StaticPool each checkout would get its own empty database, and the
        # TestClient's request thread would see none of the fixture's data.
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(test_engine, "connect")
    def _enforce_foreign_keys(dbapi_connection, _record) -> None:
        # SQLite ignores foreign keys unless asked. Without this the ownership
        # and cascade tests would pass against a schema that enforces nothing.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(test_engine)

    # custom_order_items.movie_id and watch_progress.movie_id are foreign keys
    # to `movies`, which production populates with the seed loader. Mirroring
    # that here is what makes a FK violation in a test mean something.
    catalog = get_catalog()
    with test_engine.begin() as connection:
        connection.execute(
            insert(Movie),
            [
                {
                    "id": title.id,
                    "title": title.title,
                    "release_date": title.release_date,
                    "phase": title.phase,
                    "saga": title.saga,
                    "universe": title.universe,
                    "media_type": title.media_type,
                    "tier": title.tier,
                    "runtime_min": title.runtime_min,
                    "release_order": title.release_order,
                    "chrono_order": title.chrono_order,
                }
                for title in catalog.all()
            ],
        )

    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session sharing the app's database, truncated between tests.

    Per-user tables only: `movies` is reference data seeded once.
    """
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)
    session = factory()
    try:
        yield session
    finally:
        session.close()
        with engine.begin() as connection:
            for table in ("custom_order_items", "custom_orders", "watch_progress", "users"):
                connection.exec_driver_sql(f"DELETE FROM {table}")


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """The read-only API, with no database wired up at all.

    Kept separate from `auth_client` on purpose: these tests prove the catalog
    half works with nothing but the JSON file, and quietly handing them a
    database would let that property rot unnoticed.
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    """A client whose requests share the test session.

    Overriding get_db rather than pointing DATABASE_URL at SQLite: get_engine
    and get_settings are both lru_cached, so an env var set after import is
    simply ignored.
    """
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def registered(api: TestClient) -> dict:
    """A signed-in account. The TestClient keeps the session cookie in its jar."""
    response = api.post(
        "/api/auth/register",
        json={"email": "Peter@Example.COM", "password": "web-slinger-1", "display_name": "Peter"},
    )
    assert response.status_code == 201, response.text
    return response.json()
