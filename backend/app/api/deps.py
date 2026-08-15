from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.catalog import Catalog, get_catalog
from app.core.security import COOKIE_NAME, decode_access_token
from app.db.session import get_db
from app.models.user import User

# The read-only half of the API needs no database: the catalog is the same for
# everybody and is loaded from the curated JSON file at startup. Only the
# per-user half below (accounts, saved orders, watch progress) touches Postgres.
CatalogDep = Annotated[Catalog, Depends(get_catalog)]

DbDep = Annotated[Session, Depends(get_db)]

SessionCookie = Annotated[str | None, Cookie(alias=COOKIE_NAME)]


def get_current_user_optional(db: DbDep, session_cookie: SessionCookie = None) -> User | None:
    """The signed-in user, or None -- for endpoints that serve guests too.

    The early return on a missing cookie is load bearing, not a micro
    optimisation. `SessionLocal()` opens no connection until the first query, so
    an anonymous request never reaches Postgres at all. That matters because
    production runs on NullPool (one connection per request, by design, for
    Neon's pooler), and the catalog endpoints are overwhelmingly anonymous
    traffic. Moving any query above this guard would quietly turn every page
    view into a database connection.
    """
    if not session_cookie:
        return None

    user_id = decode_access_token(session_cookie)
    if user_id is None:
        return None

    user = db.get(User, user_id)
    return user if user is not None and user.is_active else None


MaybeUserDep = Annotated[User | None, Depends(get_current_user_optional)]


def get_current_user(user: MaybeUserDep) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
