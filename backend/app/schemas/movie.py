from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict

from app.core.enums import MediaType, Saga, Strength, Tier, Universe


class MovieSummary(BaseModel):
    """The catalog-card shape: everything a list or grid needs, nothing more."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    release_date: date
    phase: int | None
    saga: Saga
    universe: Universe
    media_type: MediaType
    tier: Tier
    runtime_min: int | None
    poster_url: str | None
    release_order: int
    chrono_order: int | None


class LinkedMovie(BaseModel):
    """A neighbouring title, with the reason for the link."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    poster_url: str | None
    release_date: date
    phase: int | None
    strength: Strength
    note: str | None


class MovieDetail(MovieSummary):
    synopsis: str | None = None
    tmdb_id: int | None = None

    # Direct neighbours only. The full transitive chain is a separate endpoint
    # because it is a graph, not a list, and needs its own layout data.
    prerequisites: list[LinkedMovie] = []
    unlocks: list[LinkedMovie] = []
