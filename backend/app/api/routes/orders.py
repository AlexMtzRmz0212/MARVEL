from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CatalogDep
from app.catalog import Title
from app.core.enums import MCU_UNIVERSES
from app.core.graph import complete_order
from app.schemas.movie import MovieSummary
from app.schemas.order import (
    CompleteOrderRequest,
    CompleteOrderResponse,
    OrderResponse,
    ValidateOrderRequest,
    ValidationResult,
)
from app.services.validation import build_validation_result

router = APIRouter(prefix="/orders", tags=["orders"])

IncludeAdjacent = Annotated[
    bool,
    Query(description="Include titles from outside MCU continuity (Sony, Fox, Netflix, ABC)."),
]


def _visible(titles: list[Title], include_adjacent: bool) -> list[MovieSummary]:
    if not include_adjacent:
        titles = [title for title in titles if title.universe in MCU_UNIVERSES]
    return [MovieSummary.model_validate(title) for title in titles]


@router.get("/release", response_model=OrderResponse)
def release_order(catalog: CatalogDep, include_adjacent: IncludeAdjacent = False) -> OrderResponse:
    return OrderResponse(
        name="Release order",
        description=(
            "The order everything came out, which is the order it was written to be seen in."
        ),
        movies=_visible(catalog.all(), include_adjacent),
    )


@router.get("/chronological", response_model=OrderResponse)
def chronological_order(
    catalog: CatalogDep, include_adjacent: IncludeAdjacent = False
) -> OrderResponse:
    return OrderResponse(
        name="Chronological order",
        description="In-universe timeline order. Titles with no agreed placement come last.",
        movies=_visible(catalog.in_chronological_order(), include_adjacent),
    )


@router.post("/validate", response_model=ValidationResult)
def validate(payload: ValidateOrderRequest, catalog: CatalogDep) -> ValidationResult:
    """Check an arbitrary order against the DAG.

    Stateless, so the builder can call it on save without having persisted
    anything. During a drag the frontend runs the same check locally against
    `/graph/edges` instead, and this endpoint is the authority they reconcile
    against.
    """
    return build_validation_result(catalog.graph, catalog.titles, payload.order)


@router.post("/complete", response_model=CompleteOrderResponse)
def complete(payload: CompleteOrderRequest, catalog: CatalogDep) -> CompleteOrderResponse:
    """Add every missing prerequisite, keeping the user's arrangement where possible.

    This is what the "add all missing prerequisites" button calls. Titles the
    user chose keep their relative order wherever the DAG allows; injected
    prerequisites land immediately before whatever needed them.
    """
    graph = catalog.graph
    submitted = [movie_id for movie_id in dict.fromkeys(payload.order) if movie_id in graph]
    completed = complete_order(graph, submitted)
    return CompleteOrderResponse(
        order=completed,
        added_ids=[movie_id for movie_id in completed if movie_id not in set(submitted)],
    )
