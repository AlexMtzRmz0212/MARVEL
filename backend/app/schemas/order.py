from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import Strength
from app.schemas.movie import MovieSummary


class OrderResponse(BaseModel):
    """A precomputed viewing order, with the titles inlined."""

    name: str
    description: str
    movies: list[MovieSummary]


class Violation(BaseModel):
    kind: str
    severity: str
    movie_id: str
    movie_title: str
    prerequisite_id: str
    prerequisite_title: str
    strength: Strength
    movie_position: int | None
    prerequisite_position: int | None
    message: str


class ValidationResult(BaseModel):
    is_valid: bool
    has_warnings: bool
    checked_count: int
    violations: list[Violation]
    missing_prerequisite_ids: list[str]
    # A reordering of exactly the titles submitted. It resolves every ordering
    # violation but cannot add anything -- filling in absent prerequisites is
    # what `completed_order` is for.
    suggested_order: list[str]
    unknown_ids: list[str]
    duplicate_ids: list[str]


class ValidateOrderRequest(BaseModel):
    order: list[str] = Field(
        description="Title ids in the intended viewing order.",
        max_length=1000,
    )


class CompleteOrderRequest(BaseModel):
    order: list[str] = Field(max_length=1000)


class CompleteOrderResponse(BaseModel):
    order: list[str]
    added_ids: list[str]


class OrderSource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    url: str


class RecommendedOrderOut(BaseModel):
    """A ready-made order. Ids only: the client already holds the catalog."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tagline: str
    description: str
    # "computed" is a rule over the catalog; "curated" reproduces a published
    # list, and `sources` says whose.
    kind: Literal["computed", "curated"]
    sources: list[OrderSource]
    movie_ids: list[str]
    runtime_min: int
    # Prerequisites placed after the title that needs them, and essential
    # prerequisites left out altogether -- a short list skips by design.
    out_of_order: int
    skipped_essentials: int
