"""TMDb metadata toolkit for the curated catalog -- the command-line half.

The TMDb client itself (search, details, the season arithmetic) lives in
`app.services.tmdb` so the deployed editor can use it; this module re-exports it
for the scripts that predate the move (`fetch_episodes.py`) and keeps the pieces
only a script needs: the one-title-at-a-time `resolve` and `details_diff`.

Needs TMDB_API_KEY in the repo-root .env.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import requests

# Run as a script, `app` is only importable if the package was installed; this
# makes the scripts work from a bare checkout too.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.tmdb import (  # noqa: E402  (path set above)
    POSTER_BASE,
    TMDB,
    TmdbError,
    episode_runtime_total,
    extract_year,
    fetch_details,
    get,
    new_session,
    normalize_release_date,
    parse_seasons,
    search_candidates,
    search_endpoints,
    title_candidates,
)

__all__ = [
    "ENRICHED_FIELDS",
    "POSTER_BASE",
    "SEED_PATH",
    "TMDB",
    "TmdbError",
    "details_diff",
    "episode_runtime_total",
    "extract_year",
    "fetch_details",
    "get",
    "new_session",
    "normalize_release_date",
    "parse_seasons",
    "resolve",
    "search",
    "search_candidates",
    "search_endpoints",
    "title_candidates",
]

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = REPO_ROOT / "backend" / "app" / "seed" / "data" / "mcu.json"

ENRICHED_FIELDS = ("tmdb_id", "poster_url", "synopsis", "runtime_min", "release_date")


def search(
    session: requests.Session, api_key: str, kind: str, title: str, year: int | None
) -> int | None:
    """The single best-guess TMDb id for a title, or None.

    A thin convenience over :func:`search_candidates` for callers that want the
    top hit without a human in the loop (e.g. :func:`resolve`). Anything
    interactive should call ``search_candidates`` and let the user choose.
    """
    candidates = search_candidates(session, api_key, kind, title, year, limit=1)
    return candidates[0]["id"] if candidates else None


def resolve(
    session: requests.Session, api_key: str, title: str, year: int, media_type: str
) -> tuple[str, int, int | None] | None:
    """Find a title on TMDb. Returns (kind, tmdb_id, season_numbers)."""
    parsed = parse_seasons(title)
    if parsed:
        # Search for the show, not the season -- "Loki: Season 2" matches nothing.
        base, seasons = parsed
        for candidate_title in title_candidates(base):
            # A later season's year will not match the show's first-air year.
            show_id = search(session, api_key, "tv", candidate_title, year) or search(
                session, api_key, "tv", candidate_title, None
            )
            if show_id:
                return ("tv", show_id, seasons)
        return None

    for candidate_title in title_candidates(title):
        for kind in search_endpoints(media_type):
            # Try strict first, then adjacent years, then no year filter.
            candidate_years = (None,) if year is None else (year, year + 1, year - 1, None)
            for candidate_year in candidate_years:
                found = search(session, api_key, kind, candidate_title, candidate_year)
                if found:
                    return (kind, found, None)
    return None


def details_diff(movie: dict[str, Any], details: dict[str, Any]) -> dict[str, Any]:
    """The subset of freshly fetched TMDb fields that would actually change `movie`.

    Mirrors the old bulk enricher's "never clobber a curated value with nothing"
    rule: a null from TMDb never overwrites something already in the file. The
    editor uses this to show the user exactly what a chosen match would alter
    before it is applied.
    """
    return {
        field: value
        for field, value in details.items()
        if value is not None and movie.get(field) != value
    }
