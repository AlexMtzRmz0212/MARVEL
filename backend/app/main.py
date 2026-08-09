from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import graph, health, movies, orders
from app.core.config import get_settings
from app.core.graph import CycleError

logger = logging.getLogger(__name__)

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

    for router in (health.router, movies.router, orders.router, graph.router):
        app.include_router(router, prefix=API_PREFIX)

    return app


app = create_app()
