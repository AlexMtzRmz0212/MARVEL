from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from app.schemas.auth import Preferences

# Ceilings on the bulk paths. The catalog is ~54 titles, so anything near these
# is a client bug or an attempt to make the server do unbounded work.
MAX_ORDER_LENGTH = 1000
MAX_IMPORTED_ORDERS = 200
MAX_IMPORTED_PROGRESS = 2000


class CustomOrderOut(BaseModel):
    """Deliberately the same shape localStorage uses.

    `frontend/src/lib/orderStorage.js` stores `{id, name, movie_ids, created_at,
    updated_at}`. Matching it exactly is what lets the frontend swap between the
    local and remote backends without a translation layer, so `movie_ids` is
    flattened out of the item rows rather than exposed as objects.
    """

    id: uuid.UUID
    name: str
    movie_ids: list[str]
    created_at: datetime
    updated_at: datetime


class CustomOrderCreate(BaseModel):
    # Accepting a client-supplied id is what lets the first-login merge upload
    # orders that localStorage already gave a crypto.randomUUID() -- no
    # remapping, and a repeated import is a no-op rather than a duplicate.
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    movie_ids: list[str] = Field(default_factory=list, max_length=MAX_ORDER_LENGTH)


class CustomOrderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    movie_ids: list[str] = Field(default_factory=list, max_length=MAX_ORDER_LENGTH)


# The verdict on a title that is *not* watched. "watched" is deliberately not a
# value: a non-null watched_at already says it, and two fields that can disagree
# are worse than one. See app.models.watch_progress.
WatchStatus = Literal["unseen", "unsure"]

# Longer than any season in the catalog by a wide margin (the longest is 22).
MAX_EPISODES = 500


class WatchProgressEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    watched_at: datetime | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=2000)
    status: WatchStatus | None = None

    # 1-based positions in the title's episode list. The ORM column is
    # `episodes_watched`; the wire name matches the frontend store.
    episodes: list[int] = Field(
        default_factory=list,
        max_length=MAX_EPISODES,
        validation_alias=AliasChoices("episodes", "episodes_watched"),
    )

    @model_validator(mode="after")
    def _normalise(self) -> WatchProgressEntry:
        if any(number < 1 for number in self.episodes):
            raise ValueError("episode numbers start at 1")
        self.episodes = sorted(set(self.episodes))
        # Watched wins: a status only describes a title that is not watched.
        if self.watched_at is not None:
            self.status = None
        return self


class WatchProgressBulk(BaseModel):
    movie_ids: list[str] = Field(max_length=MAX_ORDER_LENGTH)


class ImportedOrder(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    movie_ids: list[str] = Field(default_factory=list, max_length=MAX_ORDER_LENGTH)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ImportRequest(BaseModel):
    """Everything a guest browser might be holding, in one transaction."""

    orders: list[ImportedOrder] = Field(default_factory=list, max_length=MAX_IMPORTED_ORDERS)
    watch_progress: dict[str, WatchProgressEntry] = Field(default_factory=dict)
    preferences: Preferences | None = None

    @property
    def progress_is_oversized(self) -> bool:
        return len(self.watch_progress) > MAX_IMPORTED_PROGRESS


class ImportResult(BaseModel):
    """Enough detail for the UI to report truthfully rather than "done"."""

    orders_imported: int
    orders_skipped: int
    orders_renamed: list[str] = Field(default_factory=list)
    watch_progress_imported: int
    unknown_movie_ids: list[str] = Field(default_factory=list)
