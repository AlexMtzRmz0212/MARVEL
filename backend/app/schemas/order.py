from __future__ import annotations

from pydantic import BaseModel, Field

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
