from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CatalogDep
from app.catalog import Title
from app.core.enums import MediaType, Saga, Tier, Universe
from app.schemas.graph import PrerequisiteChain
from app.schemas.movie import LinkedMovie, MovieDetail, MovieSummary
from app.services.chains import build_chain

router = APIRouter(prefix="/movies", tags=["catalog"])


@router.get("", response_model=list[MovieSummary])
def list_movies(
    catalog: CatalogDep,
    phase: Annotated[int | None, Query(ge=1, le=10)] = None,
    saga: Saga | None = None,
    universe: Universe | None = None,
    media_type: MediaType | None = None,
    tier: Tier | None = None,
    q: Annotated[
        str | None, Query(max_length=100, description="Case-insensitive title search")
    ] = None,
    order: Literal["release", "chronological", "title"] = "release",
) -> list[Title]:
    """The full catalog, filtered. Small enough that it is never paginated."""
    if order == "chronological":
        titles = catalog.in_chronological_order()
    elif order == "title":
        titles = sorted(catalog.all(), key=lambda title: title.title)
    else:
        titles = catalog.all()

    if phase is not None:
        titles = [t for t in titles if t.phase == phase]
    if saga is not None:
        titles = [t for t in titles if t.saga == saga.value]
    if universe is not None:
        titles = [t for t in titles if t.universe == universe.value]
    if media_type is not None:
        titles = [t for t in titles if t.media_type == media_type.value]
    if tier is not None:
        titles = [t for t in titles if t.tier == tier.value]
    if q:
        needle = q.casefold()
        titles = [t for t in titles if needle in t.title.casefold()]

    return titles


@router.get("/{movie_id}", response_model=MovieDetail)
def get_movie(movie_id: str, catalog: CatalogDep) -> MovieDetail:
    title = catalog.get(movie_id)
    if title is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No title with id {movie_id!r}")

    def link(other_id: str, strength: str, note: str | None) -> LinkedMovie:
        other = catalog.get(other_id)
        return LinkedMovie(
            id=other.id,
            title=other.title,
            poster_url=other.poster_url,
            release_date=other.release_date,
            phase=other.phase,
            strength=strength,
            note=note,
        )

    detail = MovieDetail.model_validate(title)
    # Direct neighbours only. The full transitive chain is a separate endpoint,
    # because it is a graph rather than a list and needs its own layout data.
    detail.prerequisites = sorted(
        (link(x.prerequisite_id, x.strength, x.note) for x in catalog.prerequisites_of(movie_id)),
        key=lambda item: item.release_date,
    )
    detail.unlocks = sorted(
        (link(x.movie_id, x.strength, x.note) for x in catalog.unlocked_by(movie_id)),
        key=lambda item: item.release_date,
    )
    return detail


@router.get("/{movie_id}/prerequisites", response_model=PrerequisiteChain)
def get_prerequisites(
    movie_id: str,
    catalog: CatalogDep,
    include: Annotated[
        Literal["all", "essential"],
        Query(description="'essential' drops recommended edges before traversing."),
    ] = "all",
) -> PrerequisiteChain:
    """Everything to watch before this title, as a drawable graph.

    Each node carries a `depth` computed by longest path, so the client lays the
    diagram out by bucketing into columns without doing any graph work itself.
    """
    chain = build_chain(catalog, movie_id, essential_only=include == "essential")
    if chain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No title with id {movie_id!r}")
    return chain
