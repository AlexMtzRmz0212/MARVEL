"""TMDb metadata toolkit for the curated catalog.

Trusted only for metadata fields -- poster, synopsis, runtime, release date, and
TMDb id -- never for the fields the curated file owns: ids, phases, sagas, tiers,
chronology and above all the prerequisite edges.

This module is a library, imported by the Streamlit catalog editor
(`scripts/catalog_editor.py`). The editor drives it interactively: it calls
`search_candidates` to show the human every TMDb match for a title, and
`fetch_details` to pull one chosen title's metadata. That human-in-the-loop step
is what keeps a title like "X-Men: First Class" from silently matching a
making-of special instead of the film.

Needs TMDB_API_KEY in the repo-root .env (the editor loads it).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import requests

try:
    # Verify certificates against the operating system's trust store rather than
    # the copy of Mozilla's bundled with certifi.
    #
    # This matters on any machine where antivirus or a corporate proxy inspects
    # HTTPS: those products re-sign traffic with their own root, install that
    # root into the OS store (so browsers work), and leave Python failing with
    # CERTIFICATE_VERIFY_FAILED because certifi has never heard of it. Deferring
    # to the OS fixes it while keeping verification fully on -- unlike
    # verify=False, which would disable it.
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # pragma: no cover - optional convenience
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = REPO_ROOT / "backend" / "app" / "seed" / "data" / "mcu.json"

TMDB = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w500"
ENRICHED_FIELDS = ("tmdb_id", "poster_url", "synopsis", "runtime_min", "release_date")


class TmdbError(RuntimeError):
    pass


def get(session: requests.Session, path: str, api_key: str, **params: Any) -> dict[str, Any]:
    response = session.get(f"{TMDB}{path}", params={"api_key": api_key, **params}, timeout=20)
    if response.status_code != 200:
        raise TmdbError(f"{path} returned {response.status_code}: {response.text[:200]}")
    return response.json()


# "Loki: Season 2" is one catalog entry but is a season of one TMDb show.
SEASON_PATTERN = re.compile(r"^(?P<base>.+):\s*Season\s+(?P<season>\d+)$")


def search_endpoints(media_type: str) -> list[str]:
    """Which TMDb index to search, in preference order.

    Specials are the awkward case: TMDb files some of them as movies (Werewolf
    by Night, the Holiday Special) and others as television, with no way to
    predict which. Trying both and taking whichever answers is more reliable
    than guessing from our own media_type.
    """
    if media_type == "film":
        return ["movie"]
    if media_type == "series":
        return ["tv"]
    return ["movie", "tv"]


def search_candidates(
    session: requests.Session,
    api_key: str,
    kind: str,
    title: str,
    year: int | None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Every TMDb match for a title, newest-relevant first, as picker-ready rows.

    This is the function the editor drives: instead of committing to the top hit
    it hands the human all of them -- title, year, poster, overview -- so a query
    like "X-Men: First Class" that returns both the film and a making-of special
    can be disambiguated by eye rather than by luck.

    Year still narrows the query when supplied (several titles share a name with
    something older -- a 2007 animated Doctor Strange, say), but it is a filter on
    the request, not a guarantee, so the caller always sees what came back.
    """
    params: dict[str, Any] = {"query": title}
    if year is not None:
        params.update({"first_air_date_year": year} if kind == "tv" else {"year": year})
    payload = get(session, f"/search/{kind}", api_key, **params)
    results = payload.get("results") or []

    candidates: list[dict[str, Any]] = []
    for result in results[:limit]:
        # TMDb names the title and date fields differently for movie vs tv.
        name = result.get("title") or result.get("name") or "(untitled)"
        date_value = result.get("release_date") or result.get("first_air_date")
        candidates.append(
            {
                "id": result["id"],
                "kind": kind,
                "title": name,
                "year": extract_year(date_value),
                "poster_path": result.get("poster_path"),
                "overview": result.get("overview") or "",
            }
        )
    return candidates


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


def title_candidates(title: str) -> list[str]:
    """Potential TMDb query variants for a curated title."""
    candidates = [title]

    # Strip common branding prefixes that TMDb omits.
    marvel_prefix = "Marvel's "
    if title.startswith(marvel_prefix):
        candidates.append(title[len(marvel_prefix) :])

    # TMDb often files these without the branding prefix.
    one_shot_prefix = "Marvel One-Shot: "
    if title.startswith(one_shot_prefix):
        candidates.append(title[len(one_shot_prefix) :])

    seen: set[str] = set()
    unique: list[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique.append(candidate)
    return unique


def resolve(
    session: requests.Session, api_key: str, title: str, year: int, media_type: str
) -> tuple[str, int, int | None] | None:
    """Find a title on TMDb. Returns (kind, tmdb_id, season_number)."""
    season_match = SEASON_PATTERN.match(title)
    if season_match:
        # Search for the show, not the season -- "Loki: Season 2" matches nothing.
        base = season_match.group("base")
        season = int(season_match.group("season"))
        for candidate_title in title_candidates(base):
            # A later season's year will not match the show's first-air year.
            show_id = search(session, api_key, "tv", candidate_title, year) or search(
                session, api_key, "tv", candidate_title, None
            )
            if show_id:
                return ("tv", show_id, season)
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


ISO_DATE_PREFIX = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def normalize_release_date(value: Any) -> str | None:
    """Return YYYY-MM-DD when possible; otherwise None."""
    if not isinstance(value, str):
        return None
    match = ISO_DATE_PREFIX.match(value)
    return match.group(1) if match else None


def extract_year(value: Any) -> int | None:
    """Return a four-digit year from a local date string when possible."""
    if not isinstance(value, str):
        return None
    match = ISO_DATE_PREFIX.match(value)
    if not match:
        return None
    try:
        return int(match.group(1)[:4])
    except ValueError:
        return None


def fetch_details(
    session: requests.Session,
    api_key: str,
    kind: str,
    tmdb_id: int,
    season: int | None,
    media_type: str,
) -> dict[str, Any]:
    if season is not None:
        payload = get(session, f"/tv/{tmdb_id}/season/{season}", api_key)
    else:
        payload = get(session, f"/{kind}/{tmdb_id}", api_key)

    poster_path = payload.get("poster_path")

    # TMDb uses different date fields per endpoint.
    if season is not None:
        tmdb_release_date = payload.get("air_date")
    elif kind == "tv":
        tmdb_release_date = payload.get("first_air_date")
    else:
        tmdb_release_date = payload.get("release_date")

    runtime_value = payload.get("runtime")
    runtime_min = None
    if isinstance(runtime_value, (int, float)) and runtime_value > 0:
        runtime_min = int(runtime_value)

    details: dict[str, Any] = {
        "tmdb_id": tmdb_id,
        "poster_url": f"{POSTER_BASE}{poster_path}" if poster_path else None,
        "synopsis": payload.get("overview") or None,
        "release_date": normalize_release_date(tmdb_release_date),
    }

    # For series, sum the runtimes of the episodes in the season. For other
    # types, use the single value from TMDb.
    if media_type == "series":
        if season is not None:
            episodes = payload.get("episodes")
            if isinstance(episodes, list):
                total_runtime = sum(
                    e.get("runtime") or 0
                    for e in episodes
                    if isinstance(e.get("runtime"), int)
                )
                if total_runtime > 0:
                    details["runtime_min"] = total_runtime
    elif runtime_min:
        details["runtime_min"] = runtime_min

    return details


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
