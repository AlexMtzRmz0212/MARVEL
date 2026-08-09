"""Fill poster art, synopses, runtimes and release dates into the curated catalog from TMDb.

    python scripts/enrich_tmdb.py --dry-run
    python scripts/enrich_tmdb.py
    python scripts/enrich_tmdb.py --force        # re-fetch titles already filled in

This is a developer tool, run occasionally and by hand. It is deliberately NOT
part of the seed path: the curated file is authoritative for everything that
matters -- ids, phases, sagas, tiers, chronology and above all the prerequisite
edges -- and TMDb is only trusted for metadata fields (poster, synopsis,
runtime, release date, and TMDb id). The predecessor of this script derived phases from release years and
fetched a single page of results, which is exactly the class of mistake that
arrangement prevents.

Writes back into the same JSON file, preserving its structure and comments, so
the result is reviewable as a diff before it ever reaches a database.

Needs TMDB_API_KEY in the repo-root .env.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

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


def search(
    session: requests.Session, api_key: str, kind: str, title: str, year: int | None
) -> int | None:
    """Search one index by title and year.

    Year matters because several titles share a name with something older -- a
    2007 animated Doctor Strange, for instance -- which the search endpoint
    otherwise returns first.
    """
    params: dict[str, Any] = {"query": title}
    if year is not None:
        params.update({"first_air_date_year": year} if kind == "tv" else {"year": year})
    payload = get(session, f"/search/{kind}", api_key, **params)
    results = payload.get("results") or []
    return results[0]["id"] if results else None


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


def enrich(
    movies: list[dict[str, Any]], api_key: str, *, force: bool, verbose: bool
) -> tuple[int, list[str]]:
    session = requests.Session()
    changed = 0
    failures: list[str] = []

    for movie in movies:
        already_done = all(
            movie.get(field) for field in ("tmdb_id", "poster_url", "synopsis")
        )
        if already_done and not force:
            continue

        year = extract_year(movie.get("release_date"))

        try:
            resolved = resolve(session, api_key, movie["title"], year, movie["media_type"])
            if resolved is None:
                failures.append(f"{movie['id']}: no TMDb match for {movie['title']!r} ({year})")
                continue

            kind, tmdb_id, season = resolved
            details = fetch_details(
                session, api_key, kind, tmdb_id, season, movie["media_type"]
            )
        except (TmdbError, requests.RequestException) as exc:
            failures.append(f"{movie['id']}: {exc}")
            continue

        updated = False
        for field, value in details.items():
            # Never clobber a curated value with nothing.
            if value is not None and movie.get(field) != value:
                movie[field] = value
                updated = True

        if updated:
            changed += 1
            if verbose:
                print(f"  {movie['id']} -> tmdb {details['tmdb_id']}")

        time.sleep(0.1)  # stay well inside TMDb's rate limit

    return changed, failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--file", type=Path, default=SEED_PATH)
    parser.add_argument("--dry-run", action="store_true", help="fetch but do not write")
    parser.add_argument(
        "--force", action="store_true", help="re-fetch titles that already have data"
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    load_dotenv(REPO_ROOT / ".env")
    api_key = os.environ.get("TMDB_API_KEY")
    if not api_key:
        print("TMDB_API_KEY is not set. Copy .env.example to .env first.", file=sys.stderr)
        return 1

    document = json.loads(args.file.read_text(encoding="utf-8"))
    movies = document["movies"]
    print(f"{args.file.name}: {len(movies)} titles")

    changed, failures = enrich(movies, api_key, force=args.force, verbose=args.verbose)

    for failure in failures:
        print(f"  warning: {failure}", file=sys.stderr)

    if args.dry_run:
        print(f"Would update {changed} title(s). Nothing written.")
        return 0

    if changed:
        args.file.write_text(
            json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"Updated {changed} title(s) in {args.file.name}.")
        print("Review the diff, then run: python -m app.seed.loader")
    else:
        print("Nothing to update.")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
