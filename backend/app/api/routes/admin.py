"""The catalog editor's API.

Everything under `/api/admin` except the sign-in itself requires the admin
cookie, and the whole router answers 404 unless an admin password is configured
(or the environment is `dev`, which has none). The payloads are the ones the
editor spoke to its old local backend in, so the frontend's logic did not have to
change when the editor moved here.

Routes are sync `def` on purpose: the TMDb calls block, and FastAPI runs a sync
route in its thread pool rather than on the event loop.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError

from app.api.deps import DbDep, is_admin, require_admin, require_admin_enabled
from app.core.config import get_settings
from app.core.enums import MediaType, Saga, Strength, Tier, Universe
from app.core.security import (
    ADMIN_COOKIE_NAME,
    ADMIN_TOKEN_EXPIRE_MINUTES,
    create_admin_token,
    verify_password,
)
from app.schemas.admin import (
    AdminLoginRequest,
    AdminSessionOut,
    CatalogRestoreRequest,
    CatalogSaveRequest,
)
from app.services import admin_auth, catalog_store, tmdb
from app.services.catalog_store import StoredCatalog

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin_enabled)]
)
protected = APIRouter(dependencies=[Depends(require_admin)])

# Only sent to the editor's own path, so no other request carries it.
COOKIE_PATH = "/api/admin"

STALE_REVISION = (
    "The catalog changed since this tab loaded it — another editor tab, or a restore. "
    "Nothing was saved, because saving would undo whatever made that change. "
    "Reload to pick up its version (this tab's unsaved changes are lost)."
)


# --------------------------------------------------------------------------- #
# Signing in
# --------------------------------------------------------------------------- #
@router.get("/session", response_model=AdminSessionOut)
def read_session(signed_in: Annotated[bool, Depends(is_admin)]) -> AdminSessionOut:
    """Not a 401 when signed out: that is the answer the sign-in page boots on."""
    return AdminSessionOut(authenticated=signed_in, open=get_settings().admin_open)


@router.post("/login", response_model=AdminSessionOut)
def login(
    payload: AdminLoginRequest, request: Request, response: Response, db: DbDep
) -> AdminSessionOut:
    settings = get_settings()
    if settings.admin_open:
        return AdminSessionOut(authenticated=True, open=True)

    key = admin_auth.client_key(request)
    wait = admin_auth.seconds_locked(db, key)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many wrong passwords. Try again later.",
            headers={"Retry-After": str(wait)},
        )

    try:
        ok, _ = verify_password(payload.password, settings.admin_password_hash.get_secret_value())
    except Exception:
        # Not a hash pwdlib recognises -- the variable was pasted wrong. Say so in
        # the log, not to the caller.
        logger.exception("ADMIN_PASSWORD_HASH is not a valid password hash")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The editor is not configured correctly.",
        ) from None

    if not ok:
        admin_auth.record_failure(db, key)
        # One message whichever way it failed, as for accounts.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password.")

    admin_auth.clear_failures(db, key)
    response.set_cookie(
        key=ADMIN_COOKIE_NAME,
        value=create_admin_token(),
        httponly=True,
        secure=settings.cookie_secure,
        # Strict, unlike the user session: nobody follows a link into the editor
        # expecting to land signed in, and Strict keeps the cookie off every
        # cross-site request including top-level navigations.
        samesite="strict",
        max_age=ADMIN_TOKEN_EXPIRE_MINUTES * 60,
        path=COOKIE_PATH,
    )
    return AdminSessionOut(authenticated=True, open=False)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    # Attributes mirror the cookie being deleted, or it is treated as another one.
    response.delete_cookie(
        key=ADMIN_COOKIE_NAME,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )


# --------------------------------------------------------------------------- #
# The catalog
# --------------------------------------------------------------------------- #
@contextmanager
def _tables_present() -> Iterator[None]:
    """Turn "the migration has not been run" into a sentence.

    Pointing the editor at a database that predates migration 0011 is the likely
    first mistake, and without this it is a bare 500 over a form.
    """
    try:
        yield
    except ProgrammingError as exc:
        text = str(exc.orig)
        if "does not exist" in text or "no such table" in text:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "The catalog tables are missing from this database. Run "
                    "`alembic upgrade head` in backend/ against it."
                ),
            ) from exc
        raise


def _storage_label() -> str:
    """Which database the editor is writing to, for the header.

    Local edits go to whichever Neon branch `backend/.env` names, and a label is
    the cheapest way to not mistake one for another. Host only: the URL carries
    the password.
    """
    host = make_url(get_settings().database_url).host or "database"
    return f"{get_settings().environment} · {host}"


def _state(stored: StoredCatalog) -> dict[str, Any]:
    validated, problems, warnings = catalog_store.check(stored.document)
    return {
        "document": stored.document,
        "revision": stored.revision,
        "updated_at": stored.updated_at,
        "storage": _storage_label(),
        "problems": problems,
        "warnings": warnings,
        "counts": {
            "titles": len(stored.document.get("movies", [])),
            "edges": len(validated.edges) if validated else 0,
        },
    }


@protected.get("/catalog")
def read_catalog(db: DbDep) -> dict[str, Any]:
    """The live catalog, verbatim, plus whether it currently validates."""
    with _tables_present():
        return _state(catalog_store.ensure_document(db))


@protected.put("/catalog")
def write_catalog(payload: CatalogSaveRequest, db: DbDep) -> dict[str, Any]:
    """Validate, then store and publish -- or refuse and change nothing.

    An invalid document is never stored, so a bad edit cannot become a 500 on the
    public site. The client rolls its own state back on either rejection, which is
    why both return their reasons rather than just a status.
    """
    try:
        with _tables_present():
            stored = catalog_store.save_document(db, payload.document, payload.revision)
    except catalog_store.RevisionConflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=STALE_REVISION) from None
    except catalog_store.InvalidCatalog as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"problems": exc.problems}
        ) from None
    return _state(stored)


@protected.get("/catalog/export")
def export_catalog(db: DbDep) -> PlainTextResponse:
    """The live catalog as `mcu.json`, byte for byte, to commit as a backup."""
    stored = catalog_store.ensure_document(db)
    return PlainTextResponse(
        catalog_store.serialise(stored.document),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="mcu.json"'},
    )


@protected.get("/catalog/history")
def read_history(db: DbDep) -> list[dict[str, Any]]:
    return catalog_store.list_history(db)


@protected.post("/catalog/restore")
def restore_catalog(payload: CatalogRestoreRequest, db: DbDep) -> dict[str, Any]:
    try:
        stored = catalog_store.restore(db, payload.history_id, payload.revision)
    except catalog_store.RevisionConflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=STALE_REVISION) from None
    except catalog_store.InvalidCatalog as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"problems": exc.problems}
        ) from None
    return _state(stored)


@protected.get("/titles/{movie_id}/usage")
def title_usage(movie_id: str, db: DbDep) -> dict[str, int]:
    """What deleting a title would take with it. Saved orders and progress hold
    foreign keys into `movies` with ON DELETE CASCADE."""
    return catalog_store.usage_of(db, movie_id)


@protected.get("/enums")
def read_enums() -> dict[str, list[str]]:
    """The controlled vocabularies, straight from the Python enums.

    Served rather than duplicated in JavaScript so a new saga is added in one
    place and the dropdowns cannot drift from what validation will accept.
    """
    return {
        "sagas": [member.value for member in Saga],
        "universes": [member.value for member in Universe],
        "media_types": [member.value for member in MediaType],
        "tiers": [member.value for member in Tier],
        "strengths": [member.value for member in Strength],
    }


# --------------------------------------------------------------------------- #
# TMDb
# --------------------------------------------------------------------------- #
def _tmdb_key() -> str:
    key = get_settings().tmdb_api_key
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TMDB_API_KEY is not set. Add it to .env (locally) or the Vercel project.",
        )
    return key.get_secret_value()


@protected.get("/tmdb/search")
def tmdb_search(title: str, media_type: str) -> list[dict[str, Any]]:
    """Every TMDb match for a title, deduplicated across query variants.

    No year filter, deliberately: the human disambiguates by the year shown on
    each candidate, which is more reliable than a filter that can hide the real
    title. This is what keeps "X-Men: First Class" from silently resolving to a
    making-of special.
    """
    key = _tmdb_key()
    session = tmdb.new_session()
    seen: set[tuple[int, str]] = set()
    results: list[dict[str, Any]] = []
    try:
        for candidate_title in tmdb.title_candidates(title):
            for kind in tmdb.search_endpoints(media_type):
                for candidate in tmdb.search_candidates(session, key, kind, candidate_title, None):
                    marker = (candidate["id"], candidate["kind"])
                    if marker in seen:
                        continue
                    seen.add(marker)
                    results.append(
                        {
                            **candidate,
                            "poster_url": (
                                f"{tmdb.POSTER_BASE}{candidate['poster_path']}"
                                if candidate.get("poster_path")
                                else None
                            ),
                        }
                    )
    except (tmdb.TmdbError, requests.RequestException) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TMDb request failed: {exc}"
        ) from exc
    return results


@protected.get("/tmdb/details")
def tmdb_details(kind: str, tmdb_id: int, media_type: str) -> dict[str, Any]:
    """One chosen title's metadata: poster, synopsis, runtime, date, id.

    Trusted for these fields only -- never for the ones the curated file owns:
    ids, phases, sagas, tiers, chronology and above all the prerequisite edges.
    """
    key = _tmdb_key()
    try:
        return tmdb.fetch_details(tmdb.new_session(), key, kind, tmdb_id, None, media_type)
    except (tmdb.TmdbError, requests.RequestException) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not fetch details: {exc}"
        ) from exc


router.include_router(protected)
