"""Load the curated catalog into Postgres.

    python -m app.seed.loader --check      # validate the file, no database needed
    python -m app.seed.loader --dry-run    # validate, connect, print the diff
    python -m app.seed.loader              # apply
    python -m app.seed.loader --prune      # apply, and delete titles no longer in the file

Every structural check runs before the first write, so a bad file changes
nothing.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Movie, Prerequisite
from app.seed.reader import DEFAULT_SEED_PATH, load_and_validate, read_seed_file
from app.seed.schema import SeedValidationError, ValidatedCatalog

# Re-exported so existing callers and tests keep working; the read path itself
# lives in app.seed.reader, which stays free of SQLAlchemy.
__all__ = ["DEFAULT_SEED_PATH", "load_and_validate", "read_seed_file", "load", "main"]

# Everything except the primary key, which is what the upsert conflicts on.
UPDATABLE_COLUMNS = (
    "title",
    "release_date",
    "phase",
    "saga",
    "universe",
    "media_type",
    "tier",
    "runtime_min",
    "poster_url",
    "synopsis",
    "tmdb_id",
    "release_order",
    "chrono_order",
)


@dataclass
class LoadReport:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    absent_from_file: list[str] = field(default_factory=list)
    edges_written: int = 0
    warnings: list[str] = field(default_factory=list)
    applied: bool = False

    @property
    def has_changes(self) -> bool:
        return bool(self.created or self.updated)


# --------------------------------------------------------------------------- #
# Row building
# --------------------------------------------------------------------------- #


def movie_rows(catalog: ValidatedCatalog) -> list[dict[str, Any]]:
    return [
        {
            "id": movie.id,
            "title": movie.title,
            "release_date": movie.release_date,
            "phase": movie.phase,
            "saga": movie.saga.value,
            "universe": movie.universe.value,
            "media_type": movie.media_type.value,
            "tier": movie.tier.value,
            "runtime_min": movie.runtime_min,
            "poster_url": movie.poster_url,
            "synopsis": movie.synopsis,
            "tmdb_id": movie.tmdb_id,
            "release_order": catalog.release_order[movie.id],
            "chrono_order": catalog.chrono_order[movie.id],
        }
        for movie in catalog.movies
    ]


def edge_rows(catalog: ValidatedCatalog) -> list[dict[str, Any]]:
    return [
        {
            "movie_id": edge.movie_id,
            "prerequisite_id": edge.prerequisite_id,
            "strength": edge.strength,
            "note": edge.note,
        }
        for edge in catalog.edges
    ]


def _normalise(value: Any) -> Any:
    """Make DB values and file values comparable for the diff."""
    return value.isoformat() if isinstance(value, date) else value


# --------------------------------------------------------------------------- #
# Applying
# --------------------------------------------------------------------------- #


def load(
    session: Session,
    catalog: ValidatedCatalog,
    *,
    dry_run: bool = False,
    prune: bool = False,
) -> LoadReport:
    """Reconcile the database with the catalog.

    Upsert rather than truncate-and-reload: truncating `movies` cascades into
    `custom_order_items` and `watch_progress`, which would destroy every user's
    data on every reseed. Edges are the exception -- they carry no user data,
    and a full replacement scoped to the titles in the file is the only way to
    handle an edge that was *removed*, which an upsert cannot express.
    """
    report = LoadReport(warnings=list(catalog.warnings))
    rows = movie_rows(catalog)
    seed_ids = {row["id"] for row in rows}

    columns = ("id", *UPDATABLE_COLUMNS)
    existing_rows = session.execute(
        select(*[getattr(Movie, column) for column in columns])
    ).all()
    existing = {row[0]: dict(zip(columns, row, strict=True)) for row in existing_rows}

    for row in rows:
        current = existing.get(row["id"])
        if current is None:
            report.created.append(row["id"])
        elif any(
            _normalise(current[column]) != _normalise(row[column]) for column in UPDATABLE_COLUMNS
        ):
            report.updated.append(row["id"])
        else:
            report.unchanged.append(row["id"])

    report.absent_from_file = sorted(set(existing) - seed_ids)
    report.edges_written = len(catalog.edges)

    if dry_run:
        return report

    upsert = pg_insert(Movie).values(rows)
    session.execute(
        upsert.on_conflict_do_update(
            index_elements=[Movie.id],
            set_={column: upsert.excluded[column] for column in UPDATABLE_COLUMNS},
        )
    )

    session.execute(delete(Prerequisite).where(Prerequisite.movie_id.in_(seed_ids)))
    edges = edge_rows(catalog)
    if edges:
        session.execute(insert(Prerequisite), edges)

    if prune and report.absent_from_file:
        session.execute(delete(Movie).where(Movie.id.in_(report.absent_from_file)))

    session.commit()
    report.applied = True
    return report


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def print_report(report: LoadReport, *, prune: bool, verbose: bool) -> None:
    for warning in report.warnings:
        print(f"  warning: {warning}")
    if report.warnings:
        print()

    verb = "Applied" if report.applied else "Would apply"
    print(
        f"{verb}: {len(report.created)} new, {len(report.updated)} changed, "
        f"{len(report.unchanged)} unchanged, {report.edges_written} prerequisite edges"
    )

    if verbose:
        for label, ids in (("new", report.created), ("changed", report.updated)):
            for movie_id in ids:
                print(f"  {label}: {movie_id}")

    if report.absent_from_file:
        if prune:
            print(f"  pruned {len(report.absent_from_file)} title(s) absent from the file")
        else:
            print(
                f"  note: {len(report.absent_from_file)} title(s) exist in the database but not "
                f"in the file: {', '.join(report.absent_from_file)}"
            )
            print("        they were left alone; pass --prune to delete them")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.seed.loader",
        description="Validate and load the curated Marvel catalog.",
    )
    parser.add_argument("--file", type=Path, default=DEFAULT_SEED_PATH, help="seed file to load")
    parser.add_argument(
        "--check", action="store_true", help="validate the file only; no database connection"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="validate and print the diff without writing"
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="delete titles that exist in the database but not in the file",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="list every changed title")
    args = parser.parse_args(argv)

    try:
        catalog = load_and_validate(args.file)
    except SeedValidationError as exc:
        print(f"{args.file.name} is not valid:\n", file=sys.stderr)
        for problem in exc.problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print(f"{args.file.name}: {len(catalog.movies)} titles, {len(catalog.edges)} edges -- valid")

    if args.check:
        for warning in catalog.warnings:
            print(f"  warning: {warning}")
        return 0

    # Imported here so --check works with no DATABASE_URL configured at all.
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        report = load(session, catalog, dry_run=args.dry_run, prune=args.prune)

    print_report(report, prune=args.prune, verbose=args.verbose)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
