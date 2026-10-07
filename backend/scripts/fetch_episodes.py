"""Write the per-episode lists for every series in the catalog.

    .venv\\Scripts\\python.exe scripts\\fetch_episodes.py [--only loki,wandavision]

Output goes to `app/seed/data/episodes.json`, a generated companion to the
curated `mcu.json`. It is a separate file on purpose: the curated file is edited
by hand and reviewed line by line, and ~700 episode rows would bury every real
change to it. Nothing in this file is a judgement call -- it is TMDb's episode
list, cut to the range each catalog entry covers -- so it is regenerated rather
than edited.

How an entry maps onto TMDb:

* the show id is the entry's own `tmdb_id`, else the id a sibling entry of the
  same show carries (later seasons were never given one), else a TMDb search;
* the seasons come from the title -- "Loki: Season 2", "I Am Groot: Seasons 1 &
  2" -- and a title naming none is the show's first season, exactly as
  `enrich_tmdb.fetch_details` reads it;
* "(Episodes 8–16)" in the title cuts a season to that range, which is how the
  catalog splits Agents of S.H.I.E.L.D. around the films it crosses over with.

Needs TMDB_API_KEY in the repo-root .env, like the catalog editor.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))

from enrich_tmdb import (  # noqa: E402
    REPO_ROOT,
    SEED_PATH,
    TmdbError,
    get,
    normalize_release_date,
    parse_seasons,
    resolve,
)

OUTPUT_PATH = SEED_PATH.parent / "episodes.json"

# "Marvel's Agents of S.H.I.E.L.D.: Season 1 (Episodes 8–16)". Any dash will do.
EPISODE_RANGE = re.compile(r"\s*\(Episodes\s+(?P<first>\d+)\s*[-–—]\s*(?P<last>\d+)\)\s*$")


def split_title(title: str) -> tuple[str, tuple[int, int] | None]:
    """The title without its episode range, and the range if it names one."""
    match = EPISODE_RANGE.search(title)
    if not match:
        return title, None
    return title[: match.start()], (int(match.group("first")), int(match.group("last")))


def show_name(title: str) -> str:
    base, _ = split_title(title)
    parsed = parse_seasons(base)
    name = parsed[0] if parsed else base
    return name.removeprefix("Marvel's ").strip()


def episode_rows(
    payload: dict[str, Any], season: int, wanted: tuple[int, int] | None
) -> list[dict]:
    rows = []
    for episode in payload.get("episodes") or []:
        number = episode.get("episode_number")
        if not isinstance(number, int):
            continue
        if wanted and not (wanted[0] <= number <= wanted[1]):
            continue
        runtime = episode.get("runtime")
        rows.append(
            {
                "season": season,
                "episode": number,
                "name": (episode.get("name") or f"Episode {number}").strip(),
                "runtime_min": runtime if isinstance(runtime, int) and runtime > 0 else None,
                "air_date": normalize_release_date(episode.get("air_date")),
            }
        )
    return rows


def dump(output: dict[str, Any]) -> str:
    """Pretty JSON with one episode per line, so a regenerated file diffs by episode."""
    lines = ["{"]
    lines.append(f'  "$comment": {json.dumps(output["$comment"], ensure_ascii=False)},')
    lines.append(f'  "version": {output["version"]},')
    lines.append('  "episodes": {')
    entries = list(output["episodes"].items())
    for index, (movie_id, rows) in enumerate(entries):
        lines.append(f"    {json.dumps(movie_id)}: [")
        lines.extend(
            f"      {json.dumps(row, ensure_ascii=False)}{',' if n < len(rows) - 1 else ''}"
            for n, row in enumerate(rows)
        )
        lines.append(f"    ]{',' if index < len(entries) - 1 else ''}")
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", help="comma-separated ids to refresh; others are kept")
    args = parser.parse_args(argv)

    load_dotenv(REPO_ROOT / ".env")
    api_key = os.environ.get("TMDB_API_KEY")
    if not api_key:
        print("TMDB_API_KEY is not set in the repo-root .env", file=sys.stderr)
        return 2

    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    series = [movie for movie in seed["movies"] if movie["media_type"] == "series"]
    only = set(args.only.split(",")) if args.only else None

    existing: dict[str, list[dict]] = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")).get("episodes", {})

    # Later seasons carry no tmdb_id of their own; borrow the one the show's
    # first entry was matched to, so nothing is searched for twice.
    show_ids: dict[str, int] = {}
    for movie in series:
        if movie.get("tmdb_id"):
            show_ids.setdefault(show_name(movie["title"]), movie["tmdb_id"])

    session = requests.Session()
    result: dict[str, list[dict]] = {}
    failures: list[str] = []

    for movie in series:
        movie_id = movie["id"]
        if only is not None and movie_id not in only:
            if movie_id in existing:
                result[movie_id] = existing[movie_id]
            continue

        base, wanted = split_title(movie["title"])
        parsed = parse_seasons(base)
        seasons = parsed[1] if parsed else [1]
        if wanted and len(seasons) != 1:
            failures.append(f"{movie_id}: an episode range needs exactly one season")
            continue

        show_id = show_ids.get(show_name(movie["title"]))
        if show_id is None:
            year = int(movie["release_date"][:4])
            found = resolve(session, api_key, base, year, "series")
            if not found:
                failures.append(f"{movie_id}: no TMDb match for {base!r}")
                continue
            show_id = found[1]
            show_ids[show_name(movie["title"])] = show_id

        rows: list[dict] = []
        try:
            for season in seasons:
                payload = get(session, f"/tv/{show_id}/season/{season}", api_key)
                rows.extend(episode_rows(payload, season, wanted))
        except TmdbError as exc:
            failures.append(f"{movie_id}: {exc}")
            continue

        if not rows:
            failures.append(f"{movie_id}: TMDb lists no episodes")
            continue
        result[movie_id] = rows
        runtime = sum(row["runtime_min"] or 0 for row in rows)
        catalog_runtime = movie.get("runtime_min")
        print(f"{movie_id:40} {len(rows):3} episodes {runtime:5} min (catalog {catalog_runtime})")

    output = {
        "$comment": [
            "GENERATED by backend/scripts/fetch_episodes.py from TMDb -- do not edit by hand.",
            "Keyed by catalog id. Episode numbers are TMDb's, within their season; watch",
            "progress refers to an episode by its 1-based position in the entry's list.",
        ],
        "version": 1,
        "episodes": {movie["id"]: result[movie["id"]] for movie in series if movie["id"] in result},
    }
    OUTPUT_PATH.write_text(dump(output), encoding="utf-8", newline="\n")
    print(f"\nWrote {len(output['episodes'])} series to {OUTPUT_PATH.relative_to(REPO_ROOT)}")

    for failure in failures:
        print(f"FAILED {failure}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
