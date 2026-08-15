"""Shape and validation of the curated catalog file.

Everything here runs before a single row is written. The seed file is the only
place a cycle or a dangling reference can be born, so this is where the catalog
earns the right to be trusted at runtime.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.enums import MediaType, Saga, Strength, Tier, Universe
from app.core.graph import (
    CycleError,
    Edge,
    Graph,
    GraphError,
    ancestors,
    format_violation,
    topological_sort,
    validate_order,
)

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]


class SeedPrerequisite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Slug
    strength: Strength = Strength.ESSENTIAL
    note: str | None = Field(default=None, max_length=280)


class SeedMovie(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Slug
    title: str = Field(max_length=200)
    release_date: date
    phase: int | None = Field(default=None, ge=1, le=10)
    saga: Saga
    universe: Universe
    media_type: MediaType
    tier: Tier
    runtime_min: int | None = Field(default=None, gt=0)
    poster_url: str | None = Field(default=None, max_length=500)
    synopsis: str | None = None
    tmdb_id: int | None = None
    prerequisites: list[SeedPrerequisite] = Field(default_factory=list)


class SeedFile(BaseModel):
    # "ignore" rather than "forbid" so the $comment blocks that document the
    # file survive round-tripping through the enrichment script.
    model_config = ConfigDict(extra="ignore")

    version: int
    movies: list[SeedMovie]


class SeedValidationError(Exception):
    """One or more structural problems, reported together.

    Collecting every problem before raising means a single run tells the author
    everything to fix, instead of the fix-one-rerun-fix-one loop that a
    first-failure design forces.
    """

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__(f"{len(problems)} problem(s) in the seed file")


@dataclass
class ValidatedCatalog:
    """A seed file that has earned the right to touch the database."""

    movies: list[SeedMovie]
    edges: list[Edge]
    graph: Graph
    chrono_order: dict[str, int]
    release_order: dict[str, int]
    warnings: list[str] = field(default_factory=list)


def validate_catalog(seed: SeedFile) -> ValidatedCatalog:
    """Run every structural check. Raises :class:`SeedValidationError` on failure."""
    problems: list[str] = []
    warnings: list[str] = []

    # -- duplicate ids -------------------------------------------------------
    seen: set[str] = set()
    duplicates: list[str] = []
    for movie in seed.movies:
        if movie.id in seen:
            duplicates.append(movie.id)
        seen.add(movie.id)
    problems.extend(f"Duplicate title id: {movie_id}" for movie_id in sorted(set(duplicates)))

    # -- duplicate tmdb_id ----------------------------------------------------
    #
    # `movies.tmdb_id` is UNIQUE in Postgres. TMDb assigns one id per *show*,
    # not per season, so a series split into several catalog rows (one per
    # season or episode range) must carry the id on only the first row -- the
    # rest stay null. Nothing caught this before the loader actually wrote to a
    # real database for the first time.
    tmdb_seen: dict[int, str] = {}
    tmdb_duplicates: list[str] = []
    for movie in seed.movies:
        if movie.tmdb_id is None:
            continue
        if movie.tmdb_id in tmdb_seen:
            tmdb_duplicates.append(
                f"{movie.id} shares tmdb_id {movie.tmdb_id} with {tmdb_seen[movie.tmdb_id]} "
                f"-- null it on every row but the first for that show"
            )
        else:
            tmdb_seen[movie.tmdb_id] = movie.id
    problems.extend(sorted(tmdb_duplicates))

    if not seed.movies:
        problems.append("The seed file contains no titles.")
    if problems:
        raise SeedValidationError(problems)

    # Array position IS the chronological order, and release order falls out of
    # the dates. Neither is hand-written, so neither can be wrong in the file.
    chrono_order = {movie.id: index for index, movie in enumerate(seed.movies)}
    release_order = {
        movie.id: index
        for index, movie in enumerate(sorted(seed.movies, key=lambda m: (m.release_date, m.id)))
    }

    edges = [
        Edge(
            movie_id=movie.id,
            prerequisite_id=prerequisite.id,
            strength=prerequisite.strength.value,
            note=prerequisite.note,
        )
        for movie in seed.movies
        for prerequisite in movie.prerequisites
    ]

    # -- structural integrity of the edge set --------------------------------
    try:
        graph = Graph.build(nodes=chrono_order, edges=edges)
    except GraphError as exc:
        raise SeedValidationError([str(exc)]) from exc

    # -- acyclicity ----------------------------------------------------------
    try:
        topological_sort(graph)
    except CycleError as exc:
        raise SeedValidationError([str(exc)]) from exc

    # -- the curated order must itself be valid ------------------------------
    #
    # This one check catches more real authoring mistakes than all the others
    # combined, and it does so by calling exactly the same validator the API
    # exposes to users. If the hand-written chronological sequence puts a title
    # before something it depends on, that is a bug in the timeline, not a
    # tolerable warning.
    titles = {movie.id: movie.title for movie in seed.movies}
    result = validate_order(graph, [movie.id for movie in seed.movies])
    problems.extend(
        f"Chronological order violates a prerequisite: {format_violation(violation, titles)}"
        for violation in result.violations
    )

    if problems:
        raise SeedValidationError(problems)

    warnings.extend(_redundancy_warnings(graph, titles))
    warnings.extend(_orphan_warnings(graph, titles))

    return ValidatedCatalog(
        movies=seed.movies,
        edges=list(graph.edges),
        graph=graph,
        chrono_order=chrono_order,
        release_order=release_order,
        warnings=warnings,
    )


def _redundancy_warnings(graph: Graph, titles: dict[str, str]) -> list[str]:
    """Flag edges already implied by another path.

    Redundancy is **strength-aware**, and this is the whole subtlety. An
    essential edge is only implied if there is an alternate path whose every
    link is also essential -- if any link along the way is merely recommended,
    dropping the direct edge would silently downgrade the prerequisite from
    "you will be lost" to "nice to have". Comparing reachability alone reports a
    pile of false positives, most of them on exactly the edges that matter most.

    An implied edge is only *clutter* when it also says nothing: a redundant
    edge carrying a note is telling the reader something the longer path does
    not, and the `is_direct` flag it produces is what lets the UI highlight
    immediate prerequisites. So note-less redundant edges are warned about
    individually, and annotated ones are summarised as a deliberate choice.
    """
    essential_only = graph.essential_only()
    notes = {(edge.prerequisite_id, edge.movie_id): edge.note for edge in graph.edges}

    unexplained: list[str] = []
    annotated = 0

    for movie_id in sorted(graph.nodes):
        for candidate in graph.predecessors(movie_id):
            # An essential edge may only be justified away by an all-essential
            # path; a recommended one may be justified by any path at all.
            scope = essential_only if graph.strength(candidate, movie_id) == "essential" else graph

            reachable: set[str] = set()
            for other in scope.predecessors(movie_id):
                if other == candidate:
                    continue
                reachable.add(other)
                reachable |= ancestors(scope, other)

            if candidate not in reachable:
                continue

            if notes.get((candidate, movie_id)):
                annotated += 1
            else:
                unexplained.append(
                    f"Redundant edge with no note: {titles.get(candidate, candidate)} -> "
                    f"{titles.get(movie_id, movie_id)} is already implied by another path, "
                    f"and adds no explanation. Remove it or give it a note."
                )

    if annotated:
        unexplained.append(
            f"{annotated} redundant edge(s) kept deliberately: each is implied by another "
            f"path but carries a note and marks a direct prerequisite in the UI."
        )
    return unexplained


def _orphan_warnings(graph: Graph, titles: dict[str, str]) -> list[str]:
    """Titles connected to nothing at all -- usually a forgotten edge."""
    return [
        f"Orphan: {titles.get(movie_id, movie_id)} has no prerequisites and unlocks nothing"
        for movie_id in sorted(graph.nodes)
        if not graph.predecessors(movie_id) and not graph.successors(movie_id)
    ]
