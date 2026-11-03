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

# Run as a script, `app` is only importable if the package was installed; this
# makes the scripts work from a bare checkout too.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.tmdb import (  # noqa: E402  (path set above)
    POSTER_BASE,
    TMDB,
    TmdbError,
    episode_rows,
    episode_rows_for,
    episode_runtime_total,
    extract_year,
    fetch_details,
    get,
    new_session,
    normalize_release_date,
    parse_seasons,
    resolve,
    search,
    search_candidates,
    search_endpoints,
    show_ids_of,
    show_name,
    split_title,
    title_candidates,
)

__all__ = [
    "ENRICHED_FIELDS",
    "POSTER_BASE",
    "SEED_PATH",
    "TMDB",
    "TmdbError",
    "details_diff",
    "episode_rows",
    "episode_rows_for",
    "episode_runtime_total",
    "extract_year",
    "fetch_details",
    "get",
    "new_session",
    "normalize_release_date",
    "parse_seasons",
    "resolve",
    "search",
    "show_ids_of",
    "show_name",
    "split_title",
    "search_candidates",
    "search_endpoints",
    "title_candidates",
]

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = REPO_ROOT / "backend" / "app" / "seed" / "data" / "mcu.json"

ENRICHED_FIELDS = ("tmdb_id", "poster_url", "synopsis", "runtime_min", "release_date")


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
