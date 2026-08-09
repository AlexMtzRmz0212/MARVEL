"""Production entrypoint: one process serving both the API and the built SPA.

Vercel looks for a `FastAPI` instance named `app` at a small set of standard
filenames, and `server.py` at the repository root is one of them -- which is why
this file exists rather than the `api/index.py` shim plus a rewrite rule that
older guides describe. It is deliberately *not* named `app.py`: that would
shadow the `app` package inside `backend/`.

Locally this is optional. `run.bat` starts uvicorn and Vite separately, and Vite
proxies `/api` to uvicorn, so the two environments have the same same-origin
shape. Run this file instead to exercise exactly what production serves:

    cd frontend && npm run build
    backend\\.venv\\Scripts\\python.exe -m uvicorn server:app --port 8000
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402  (path must be set before this import)

DIST = ROOT / "frontend" / "dist"

# `frontend()` registers the build as *low-priority* routes: every `/api/...`
# path operation is matched first, and anything left over falls back to
# index.html so client-side deep links such as
# /movies/avengers-endgame/prereqs load directly. On Vercel these files are
# promoted to the CDN at build time rather than being served by the function.
#
# Guarded because the directory only exists after a frontend build, and in
# development Vite serves the app instead.
if DIST.is_dir():
    # The fallback is what makes client-side deep links work: a request for
    # /movies/avengers-endgame/prereqs matches no file, so index.html is served
    # and the router takes over. FastAPI only does this for browser *navigation*
    # requests, so a genuinely missing asset still 404s instead of returning
    # HTML that a script tag would choke on.
    #
    # Named explicitly rather than left as "auto": auto prefers 404.html when one
    # exists, so adding a 404 page later would otherwise silently turn every
    # deep link into a 404.
    app.frontend("/", directory=DIST, fallback="index.html")

__all__ = ["app"]
