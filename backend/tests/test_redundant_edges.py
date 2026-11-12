"""`find_redundant_edges`: the structured findings behind the redundancy warnings."""

from __future__ import annotations

from app.core.graph import Edge, Graph
from app.seed.schema import _redundancy_warnings, find_redundant_edges


def _graph(*edges: Edge) -> Graph:
    nodes = {"a": 0, "b": 1, "c": 2}
    return Graph.build(nodes=nodes, edges=edges)


def test_an_edge_implied_by_an_all_essential_path_is_redundant():
    graph = _graph(
        Edge("b", "a"),
        Edge("c", "b"),
        Edge("c", "a"),
    )

    found = find_redundant_edges(graph)

    assert [(r["owner_id"], r["prerequisite_id"], r["via"]) for r in found] == [("c", "a", "b")]
    assert found[0]["note"] is None


def test_an_essential_edge_is_not_redundant_if_the_path_has_a_recommended_link():
    # Dropping a -> c would downgrade "required" to "nice to have".
    graph = _graph(
        Edge("b", "a", "recommended"),
        Edge("c", "b"),
        Edge("c", "a"),
    )

    assert find_redundant_edges(graph) == []


def test_a_recommended_edge_may_be_implied_by_any_path():
    graph = _graph(
        Edge("b", "a"),
        Edge("c", "b"),
        Edge("c", "a", "recommended"),
    )

    found = find_redundant_edges(graph)

    assert [(r["owner_id"], r["prerequisite_id"]) for r in found] == [("c", "a")]


def test_the_note_travels_with_the_finding_and_changes_the_warning():
    graph = _graph(
        Edge("b", "a"),
        Edge("c", "b"),
        Edge("c", "a", "essential", "Watch it right before"),
    )
    titles = {"a": "A", "b": "B", "c": "C"}

    found = find_redundant_edges(graph)
    warnings = _redundancy_warnings(found, titles)

    assert found[0]["note"] == "Watch it right before"
    assert warnings[0].startswith("Redundant edge kept deliberately: A -> C")


def test_unexplained_warnings_come_first_and_say_what_to_do():
    graph = _graph(
        Edge("b", "a"),
        Edge("c", "b"),
        Edge("c", "a"),
    )

    (warning,) = _redundancy_warnings(find_redundant_edges(graph), {"a": "A", "b": "B", "c": "C"})

    assert warning.startswith("Redundant edge with no note: A -> C")
    assert "Remove it or give it a note" in warning
