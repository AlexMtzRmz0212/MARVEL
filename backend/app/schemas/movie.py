from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict

from app.core.enums import MediaType, Saga, Strength, Tier, Universe


class CreditSceneEpisode(BaseModel):
    """One episode of a series with something after the credits."""

    model_config = ConfigDict(from_attributes=True)

    episode: int
    name: str | None
    count: int
    note: str | None


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

    # Scenes during or after the credits. `null` means nobody has checked; `0`
    # means somebody sat through them and there was nothing. The card only draws
    # a mark for a positive number, so the two are never conflated on screen.
    credit_scenes: int | None = None


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

    # The breakdown behind `credit_scenes`. Series only -- which episode holds
    # one is the whole question for a twelve-hour season, and dead weight on a
    # film, where the count and the note say everything.
    credit_scene_note: str | None = None
    credit_scene_episodes: list[CreditSceneEpisode] = []

    # Direct neighbours only. The full transitive chain is a separate endpoint
    # because it is a graph, not a list, and needs its own layout data.
    prerequisites: list[LinkedMovie] = []
    unlocks: list[LinkedMovie] = []
