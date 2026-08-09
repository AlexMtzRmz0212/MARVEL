"""The catalog, held in memory, loaded from the curated JSON file.

Nothing about the catalog is per-user: the same 54 titles and 80 edges are
served to everybody, they change only when the seed file changes, and the whole
thing is a few tens of kilobytes. So it is read once at startup and kept as
frozen dataclasses. That keeps the read-only half of the API -- the catalog, the
orders, and the prerequisite graph, which is to say the entire headline feature
-- working with no database at all.

Postgres is still where the *per-user* data belongs: accounts, saved custom
orders, and watch progress. `app.models` and the migration are already in place
for that; they simply are not needed yet.

The `Title` record here mirrors the `Movie` ORM model field for field, so the
API schemas validate identically from either source and the eventual switch is
a change of dependency, not of shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.core.graph import Graph, MovieId
from app.seed.loader import DEFAULT_SEED_PATH, load_and_validate

# Titles with no agreed in-universe placement sort after every title that has
# one, in release order. A large offset rather than None keeps the tie-break key
# a plain comparable int, which the heap in Kahn's algorithm requires.
CHRONO_FALLBACK_OFFSET = 100_000


def sort_key(chrono_order: int | None, release_order: int) -> int:
    if chrono_order is not None:
        return chrono_order
    return CHRONO_FALLBACK_OFFSET + release_order


@dataclass(frozen=True, slots=True)
class Title:
    """One catalog entry. Mirrors the `Movie` ORM model."""

    id: MovieId
    title: str
    release_date: date
    phase: int | None
    saga: str
    universe: str
    media_type: str
    tier: str
    runtime_min: int | None
    poster_url: str | None
    synopsis: str | None
    tmdb_id: int | None
    release_order: int
    chrono_order: int | None


@dataclass(frozen=True, slots=True)
class Link:
    """A direct dependency between two titles, with the reason for it."""

    movie_id: MovieId
    prerequisite_id: MovieId
    strength: str
    note: str | None


class Catalog:
    """Everything the read-only API needs, indexed once."""

    __slots__ = ("_titles", "_graph", "_prerequisites", "_dependents")

    def __init__(self, titles: list[Title], graph: Graph, links: list[Link]) -> None:
        self._titles = {title.id: title for title in titles}
        self._graph = graph

        self._prerequisites: dict[MovieId, list[Link]] = {t.id: [] for t in titles}
        self._dependents: dict[MovieId, list[Link]] = {t.id: [] for t in titles}
        for link in links:
            self._prerequisites[link.movie_id].append(link)
            self._dependents[link.prerequisite_id].append(link)

    @property
    def graph(self) -> Graph:
        return self._graph

    @property
    def titles(self) -> dict[MovieId, str]:
        """id -> title, for rendering violation messages."""
        return {movie_id: title.title for movie_id, title in self._titles.items()}

    def __contains__(self, movie_id: object) -> bool:
        return movie_id in self._titles

    def get(self, movie_id: MovieId) -> Title | None:
        return self._titles.get(movie_id)

    def all(self) -> list[Title]:
        """Every title, in release order."""
        return sorted(self._titles.values(), key=lambda title: title.release_order)

    def in_chronological_order(self) -> list[Title]:
        return sorted(
            self._titles.values(),
            key=lambda title: sort_key(title.chrono_order, title.release_order),
        )

    def prerequisites_of(self, movie_id: MovieId) -> list[Link]:
        return self._prerequisites.get(movie_id, [])

    def unlocked_by(self, movie_id: MovieId) -> list[Link]:
        return self._dependents.get(movie_id, [])


def build_catalog(path: Path = DEFAULT_SEED_PATH) -> Catalog:
    """Validate the seed file and index it.

    Reuses the same validator the database loader runs, so a broken catalog
    fails at startup with the same message it would fail a seed with -- there is
    no second, weaker code path.
    """
    validated = load_and_validate(path)

    titles = [
        Title(
            id=movie.id,
            title=movie.title,
            release_date=movie.release_date,
            phase=movie.phase,
            saga=movie.saga.value,
            universe=movie.universe.value,
            media_type=movie.media_type.value,
            tier=movie.tier.value,
            runtime_min=movie.runtime_min,
            poster_url=movie.poster_url,
            synopsis=movie.synopsis,
            tmdb_id=movie.tmdb_id,
            release_order=validated.release_order[movie.id],
            chrono_order=validated.chrono_order[movie.id],
        )
        for movie in validated.movies
    ]

    # Rebuild the graph keyed by the same sort key the API will use, so that a
    # topological sort tie-breaks by chronology exactly as the seed intends.
    graph = validated.graph.rekeyed(
        lambda movie_id: sort_key(
            validated.chrono_order.get(movie_id), validated.release_order[movie_id]
        )
    )

    links = [
        Link(
            movie_id=edge.movie_id,
            prerequisite_id=edge.prerequisite_id,
            strength=edge.strength,
            note=edge.note,
        )
        for edge in validated.edges
    ]

    return Catalog(titles=titles, graph=graph, links=links)


@lru_cache
def get_catalog() -> Catalog:
    return build_catalog()
