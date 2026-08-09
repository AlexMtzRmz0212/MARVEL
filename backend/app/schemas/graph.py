from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import MediaType, Saga, Strength, Tier


class GraphNode(BaseModel):
    """One title in a prerequisite chain, carrying its own layout position.

    `depth` is computed server-side by longest path, so the frontend can lay the
    graph out by bucketing nodes into columns and never has to do graph maths.
    """

    id: str
    title: str
    poster_url: str | None
    release_date: date
    phase: int | None
    saga: Saga
    media_type: MediaType
    tier: Tier
    runtime_min: int | None
    chrono_order: int | None

    depth: int
    strength: Strength
    is_direct: bool
    is_target: bool
    watched: bool | None = None  # populated only when the request is authenticated


class GraphEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: str = Field(alias="from")
    target: str = Field(alias="to")
    strength: Strength
    note: str | None = None


class ChainStats(BaseModel):
    total: int
    essential: int
    recommended: int
    total_runtime_min: int | None
    max_depth: int
    watched: int | None = None
    remaining: int | None = None


class PrerequisiteChain(BaseModel):
    """The headline payload: a graph, not a list, because it gets drawn."""

    movie: GraphNode
    stats: ChainStats
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    watch_order: list[str]


class EdgeList(BaseModel):
    """The whole edge set, small enough to ship once and cache forever.

    The frontend runs its own copy of the validator against this so that
    drag-and-drop feedback is instant instead of a round trip per drag.
    """

    edges: list[GraphEdge]
