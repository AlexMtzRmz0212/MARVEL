from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    """Built on first use, not at import.

    Importing this module must not require a reachable database -- the seed
    loader's --check mode and every pure unit test import code paths that
    transitively reach here without ever opening a connection.
    """
    settings = get_settings()

    if settings.environment == "prod":
        # Serverless functions must not hold their own pool. Each invocation may
        # land in a fresh instance, so a per-instance pool multiplies connections
        # until Postgres refuses new ones. NullPool opens and closes per request
        # and lets Neon's PgBouncer do the pooling -- which is why DATABASE_URL
        # must point at the "-pooler" host in production.
        return create_engine(settings.database_url, poolclass=NullPool)

    return create_engine(settings.database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autocommit=False, autoflush=False, class_=Session)


def SessionLocal() -> Session:  # noqa: N802 - reads as a class at call sites
    return get_sessionmaker()()


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
