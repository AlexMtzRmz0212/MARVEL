from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CatalogDep
from app.schemas.graph import EdgeList, GraphEdge

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/edges", response_model=EdgeList)
def list_edges(catalog: CatalogDep) -> EdgeList:
    """The complete edge set in one small response.

    A few hundred rows, immutable between deploys, so the client fetches it once
    and caches it forever. That is what makes live validation during a drag
    instant: the same O(E) check runs locally instead of a request per drop.
    """
    return EdgeList(
        edges=[
            GraphEdge(
                source=edge.prerequisite_id,
                target=edge.movie_id,
                strength=edge.strength,
                note=edge.note,
            )
            for edge in catalog.graph.edges
        ]
    )
