"""The local API behind the catalog editor.

Run it with `catalog.bat` (repo root), which starts this and the Vite dev
server together, or on its own:

    cd backend
    .venv\\Scripts\\python.exe scripts\\catalog_api.py

Deliberately a *separate* FastAPI app rather than a router on `app.main`. The
editor needs `requests` and `python-dotenv`, which are dev-only extras: mounting
it on the shipped app would make the Vercel function import them and fail at
cold start. Keeping the two apart means production cannot see this code at all,
which is a stronger guarantee than a feature flag.

Only ever bound to 127.0.0.1. It writes to the repo working tree with no
authentication, so it must not be reachable from anywhere else.

The browser reaches it through the Vite proxy at `/editor-api` (see
`frontend/vite.config.js`), so the editor is same-origin and there is no CORS
to configure.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# --- import path -----------------------------------------------------------
# Run as a script, so make both the backend package root (for `app.*`) and this
# scripts directory (for `enrich_tmdb`) importable.
SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
for path in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

import enrich_tmdb  # noqa: E402  (path set above)

from app.core.enums import MediaType, Saga, Strength, Tier, Universe  # noqa: E402
from app.seed.schema import SeedFile, SeedValidationError, validate_catalog  # noqa: E402

SEED_PATH = enrich_tmdb.SEED_PATH
POSTER_BASE = enrich_tmdb.POSTER_BASE

app = FastAPI(
    title="MARVEL catalog editor API",
    docs_url="/editor-api/docs",
    openapi_url="/editor-api/openapi.json",
)


# --------------------------------------------------------------------------- #
# Reading, validating, writing
# --------------------------------------------------------------------------- #
def revision_of(text: str) -> str:
    """A short content hash, used as an optimistic-concurrency token.

    Two editor tabs open on one file is the failure that costs an afternoon: the
    stale one writes its whole document back and silently reinstates every edge
    the other had removed. The client sends back the revision it loaded, and a
    write against a stale one is refused rather than merged.

    Content-addressed rather than a counter, so it survives a restart of this
    process and notices an edit made in a text editor just as readily.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def serialise(document: dict[str, Any]) -> str:
    """The document as it is written to disk, byte for byte.

    Also used to compute the revision returned after a write, so the client's
    token always matches what is actually on disk.
    """
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def validate_document(document: dict[str, Any]) -> tuple[Any, list[str], list[str]]:
    """Run the loader's own checks. Returns (catalog, problems, warnings).

    The same two-stage validation the seed loader performs -- pydantic for
    shape, then `validate_catalog` for the structural rules a type cannot
    express (cycles, dangling edges, a chronology that contradicts its own
    prerequisites). Using the real thing rather than a reimplementation is the
    point: nothing can be saved here that the API would then refuse to load.
    """
    try:
        seed = SeedFile.model_validate(document)
    except Exception as exc:  # pydantic ValidationError -> readable lines
        errors = getattr(exc, "errors", None)
        if callable(errors):
            return None, [
                f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                for error in exc.errors()
            ], []
        return None, [str(exc)], []

    try:
        catalog = validate_catalog(seed)
    except SeedValidationError as exc:
        return None, list(exc.problems), []
    return catalog, [], list(catalog.warnings)


def state_payload(text: str, document: dict[str, Any]) -> dict[str, Any]:
    catalog, problems, warnings = validate_document(document)
    return {
        "document": document,
        "revision": revision_of(text),
        "path": str(SEED_PATH),
        "problems": problems,
        "warnings": warnings,
        "counts": {
            "titles": len(document.get("movies", [])),
            "edges": len(catalog.edges) if catalog else 0,
        },
    }


def read_from_disk() -> tuple[str, dict[str, Any]]:
    """The file as text and as data.

    Read as text first so `$comment` and `version` survive the round trip and
    the revision is computed from exactly what is on disk.

    Unparseable JSON gets its own answer rather than a 500: the file is
    hand-editable and under version control, so arriving mid-merge-conflict or
    mid-typo is a normal thing to walk into, and the editor should say which
    line rather than showing a stack trace.
    """
    text = SEED_PATH.read_text(encoding="utf-8")
    try:
        return text, json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "problems": [
                    f"mcu.json is not valid JSON: {exc.msg} at line {exc.lineno}, "
                    f"column {exc.colno}. Fix it in a text editor, then reload."
                ]
            },
        ) from exc


@app.get("/editor-api/catalog")
def read_catalog() -> dict[str, Any]:
    """The file verbatim, plus its validity."""
    return state_payload(*read_from_disk())


class SaveRequest(BaseModel):
    document: dict[str, Any]
    revision: str = Field(description="The revision the client loaded, for conflict detection.")


@app.put("/editor-api/catalog")
def write_catalog(request: SaveRequest) -> dict[str, Any]:
    """Validate, then write -- or refuse and change nothing.

    An invalid document is never written, so a bad edit cannot become a 500 on
    the deployed site. The client rolls its own state back on either rejection,
    which is why both return the problems rather than just a status.
    """
    on_disk, _ = read_from_disk()
    if revision_of(on_disk) != request.revision:
        raise HTTPException(
            status_code=409,
            detail=(
                "mcu.json changed on disk since this tab loaded it — another editor "
                "tab, or a text editor. Nothing was written, because saving would "
                "undo whatever made that change. Reload to pick up its version "
                "(this tab's unsaved changes are lost)."
            ),
        )

    catalog, problems, warnings = validate_document(request.document)
    if problems:
        raise HTTPException(status_code=422, detail={"problems": problems})

    # A copy beside the file rather than a history: the repo is in git, so this
    # only has to cover the seconds between a bad write and noticing it.
    shutil.copy2(SEED_PATH, SEED_PATH.with_name(f"{SEED_PATH.name}.bak"))

    text = serialise(request.document)
    # newline="\n": without it Windows writes CRLF and every save shows up as a
    # whole-file change in git, burying the one edge that actually moved.
    SEED_PATH.write_text(text, encoding="utf-8", newline="\n")
    return state_payload(text, request.document)


@app.get("/editor-api/enums")
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
def api_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    key = os.environ.get("TMDB_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="TMDB_API_KEY is not set. Copy .env.example to .env at the repo root.",
        )
    return key


@app.get("/editor-api/tmdb/search")
def tmdb_search(title: str, media_type: str) -> list[dict[str, Any]]:
    """Every TMDb match for a title, deduplicated across query variants.

    No year filter, deliberately: the human disambiguates by the year shown on
    each candidate, which is more reliable than a filter that can hide the real
    title. This is what keeps "X-Men: First Class" from silently resolving to a
    making-of special.
    """
    key = api_key()
    session = requests.Session()
    seen: set[tuple[int, str]] = set()
    results: list[dict[str, Any]] = []
    try:
        for candidate_title in enrich_tmdb.title_candidates(title):
            for kind in enrich_tmdb.search_endpoints(media_type):
                for candidate in enrich_tmdb.search_candidates(
                    session, key, kind, candidate_title, None
                ):
                    marker = (candidate["id"], candidate["kind"])
                    if marker in seen:
                        continue
                    seen.add(marker)
                    results.append(
                        {
                            **candidate,
                            "poster_url": (
                                f"{POSTER_BASE}{candidate['poster_path']}"
                                if candidate.get("poster_path")
                                else None
                            ),
                        }
                    )
    except (enrich_tmdb.TmdbError, requests.RequestException) as exc:
        raise HTTPException(status_code=502, detail=f"TMDb request failed: {exc}") from exc
    return results


@app.get("/editor-api/tmdb/details")
def tmdb_details(kind: str, tmdb_id: int, media_type: str) -> dict[str, Any]:
    """One chosen title's metadata: poster, synopsis, runtime, date, id.

    Trusted for these fields only -- never for the ones the curated file owns:
    ids, phases, sagas, tiers, chronology and above all the prerequisite edges.
    """
    key = api_key()
    session = requests.Session()
    try:
        return enrich_tmdb.fetch_details(session, key, kind, tmdb_id, None, media_type)
    except (enrich_tmdb.TmdbError, requests.RequestException) as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch details: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    # 127.0.0.1, never 0.0.0.0: this writes to the working tree unauthenticated.
    uvicorn.run(app, host="127.0.0.1", port=8010, log_level="warning")
