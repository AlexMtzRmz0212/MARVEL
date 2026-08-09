"""Turn a computed prerequisite chain into the API payload the UI draws."""

from __future__ import annotations

from app.catalog import Catalog, Title
from app.core import graph as graph_engine
from app.schemas.graph import ChainStats, GraphEdge, GraphNode, PrerequisiteChain


def _to_node(title: Title, chain_node: graph_engine.ChainNode, watched: bool | None) -> GraphNode:
    return GraphNode(
        id=title.id,
        title=title.title,
        poster_url=title.poster_url,
        release_date=title.release_date,
        phase=title.phase,
        saga=title.saga,
        media_type=title.media_type,
        tier=title.tier,
        runtime_min=title.runtime_min,
        chrono_order=title.chrono_order,
        depth=chain_node.depth,
        strength=chain_node.strength,
        is_direct=chain_node.is_direct,
        is_target=chain_node.is_target,
        watched=watched,
    )


def build_chain(
    catalog: Catalog,
    movie_id: str,
    *,
    essential_only: bool = False,
    watched_ids: set[str] | None = None,
) -> PrerequisiteChain | None:
    """Assemble the full chain payload, or None if the title does not exist."""
    if movie_id not in catalog:
        return None

    graph = catalog.graph.essential_only() if essential_only else catalog.graph
    chain = graph_engine.prerequisite_chain(graph, movie_id)

    nodes = [
        _to_node(
            catalog.get(node.movie_id),
            node,
            (node.movie_id in watched_ids) if watched_ids is not None else None,
        )
        for node in chain.nodes
    ]
    target = next(node for node in nodes if node.is_target)
    prerequisites = [node for node in nodes if not node.is_target]

    # Series have no single runtime, so this is the total of everything that
    # does have one -- a floor, not an exact figure.
    known_runtimes = [node.runtime_min for node in prerequisites if node.runtime_min]

    watched_count = (
        sum(1 for node in prerequisites if node.watched) if watched_ids is not None else None
    )

    return PrerequisiteChain(
        movie=target,
        stats=ChainStats(
            total=len(prerequisites),
            essential=sum(1 for node in prerequisites if node.strength == "essential"),
            recommended=sum(1 for node in prerequisites if node.strength == "recommended"),
            total_runtime_min=sum(known_runtimes) or None,
            max_depth=chain.max_depth,
            watched=watched_count,
            remaining=(len(prerequisites) - watched_count) if watched_count is not None else None,
        ),
        nodes=nodes,
        edges=[
            GraphEdge(
                source=edge.prerequisite_id,
                target=edge.movie_id,
                strength=edge.strength,
                note=edge.note,
            )
            for edge in chain.edges
        ],
        watch_order=list(chain.watch_order),
    )
