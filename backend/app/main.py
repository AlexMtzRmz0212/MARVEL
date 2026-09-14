from __future__ import annotations

import logging
import re

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.routes import auth, friends, graph, health, me, movies, orders, share
from app.core.config import get_settings
from app.core.graph import CycleError

logger = logging.getLogger(__name__)

# Postgres reports constraint failures by SQLSTATE, which psycopg exposes as
# `sqlstate`. sqlite3 exposes nothing comparable, so the message fragments are
# the portable fallback: the default test suite runs on SQLite (with foreign
# keys switched on -- see tests/api/conftest.py) and has to reach these same
# branches, or the handler would only be covered by the Postgres-only job.
FK_VIOLATION = "23503"
UNIQUE_VIOLATION = "23505"
SQLITE_FK_VIOLATION = "FOREIGN KEY constraint failed"
SQLITE_UNIQUE_VIOLATION = "UNIQUE constraint failed"

# Postgres names the offending value on its DETAIL line:
#   Key (movie_id)=(blade) is not present in table "movies".
KEY_DETAIL = re.compile(r"Key \((?P<column>[^)]+)\)=\((?P<value>[^)]+)\)")


def _missing_movie_id(exc: IntegrityError) -> str | None:
    """The title id Postgres named, when the driver gave us one to name.

    SQLite says only "FOREIGN KEY constraint failed", so this returns None
    there and the message degrades to the un-named form rather than guessing.
    """
    diag = getattr(exc.orig, "diag", None)
    match = KEY_DETAIL.search(getattr(diag, "message_detail", None) or "")
    if match is None or match["column"] != "movie_id":
        return None
    return match["value"]

# Every route is mounted under /api.
#
# This is a prefix on the router rather than FastAPI's `root_path` because
# neither proxy in front of this app strips the prefix: the Vite dev proxy
# forwards /api/* verbatim to uvicorn, and Vercel's rewrite hands the function
# the original URL. The app therefore genuinely serves /api/... in both
# environments, and the two stay identical.
API_PREFIX = "/api"


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="MCU Watch Order API",
        version="0.1.0",
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
    )

    # In production the SPA and the API share an origin, so the browser never
    # makes a cross-origin request and this list is empty. It exists for local
    # development, where Vite serves on :5173.
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(CycleError)
    async def handle_cycle(_: Request, exc: CycleError) -> JSONResponse:
        """A cycle at runtime means the catalog data is corrupt.

        The seed loader refuses to write a cyclic edge set, so reaching this is
        a genuine integrity failure. Report it loudly and name the cycle rather
        than quietly falling back to release order -- a silent fallback would
        hide the bug indefinitely.
        """
        logger.error("Prerequisite cycle in catalog data: %s", exc.cycle)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "The catalog contains a prerequisite cycle, so no valid order exists.",
                "cycle": exc.cycle,
            },
        )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        """A constraint violation that reached the top of a request.

        One of these is reachable without any client doing anything wrong, and
        it is the reason this handler exists. `movies` is the foreign-key target
        for watch progress and saved order items, and the seed loader populates
        it -- but the catalog those endpoints validate ids against is served
        from the JSON file (see `app.catalog`), never from that table. Deploy a
        catalog with a new title and forget to reseed and the two disagree: the
        id passes `_known()` in `app.api.routes.me`, whose docstring promises
        this exact 500 will not happen, and then fails at flush time anyway.

        So the guard there is necessary but not sufficient, and this is the
        backstop. A stale database is a server-side data problem: say so, name
        the title, and log the command that fixes it, rather than letting the
        SPA render "Request failed with status 500" over a silently rolled-back
        toggle.

        The session is never left dirty -- `get_db` closes it in its `finally`,
        which rolls back the failed transaction.
        """
        sqlstate = getattr(exc.orig, "sqlstate", None)
        text = str(exc.orig)

        if sqlstate == FK_VIOLATION or SQLITE_FK_VIOLATION in text:
            missing = _missing_movie_id(exc)
            logger.error(
                "Foreign key violation writing per-user data (%s). The database is behind "
                "app/seed/data/mcu.json; run `python -m app.seed.loader` against it.",
                f"movie_id={missing!r}" if missing else text,
            )
            subject = f"'{missing}'" if missing else "That title"
            body: dict[str, str] = {
                "detail": (
                    f"{subject} is in the catalog but missing from the database, so it cannot "
                    "be saved. The server's catalog needs reseeding."
                )
            }
            if missing is not None:
                body["movie_id"] = missing
            return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body)

        if sqlstate == UNIQUE_VIOLATION or SQLITE_UNIQUE_VIOLATION in text:
            # The routes pre-check the name clashes they know about; this is the
            # race that slips between that SELECT and the INSERT. Same status
            # the pre-check returns, so a client cannot tell the two apart.
            logger.warning("Unique constraint violation: %s", text)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"detail": "That already exists."},
            )

        logger.exception("Unhandled integrity error")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "The write violated a database constraint."},
        )

    for router in (
        health.router,
        movies.router,
        orders.router,
        graph.router,
        auth.router,
        me.router,
        friends.router,
        share.router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    return app


app = create_app()
