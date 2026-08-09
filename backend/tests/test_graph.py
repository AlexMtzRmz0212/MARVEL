"""Unit tests for the pure DAG engine.

No fixtures, no database, no app import beyond the module under test -- these
run in milliseconds and are meant to stay that way.
"""

from __future__ import annotations

import random

import pytest

from app.core.graph import (
    CycleError,
    Edge,
    Graph,
    SelfEdgeError,
    UnknownNodeError,
    ancestors,
    complete_order,
    find_cycle,
    format_violation,
    prerequisite_chain,
    repair_order,
    topological_sort,
    validate_order,
)


def build(nodes: dict[str, int], *edges: tuple) -> Graph:
    """Compact builder: build({"a": 1}, ("b", "a"), ("c", "b", "recommended"))."""
    return Graph.build(
        nodes=nodes,
        edges=[
            Edge(
                movie_id=e[0],
                prerequisite_id=e[1],
                strength=e[2] if len(e) > 2 else "essential",
            )
            for e in edges
        ],
    )


def keys(*ids: str) -> dict[str, int]:
    return {movie_id: index for index, movie_id in enumerate(ids)}


# --------------------------------------------------------------------------- #
# Topological sort
# --------------------------------------------------------------------------- #


def test_empty_graph_sorts_to_nothing():
    assert topological_sort(build({})) == []


def test_single_node_needs_no_edges():
    assert topological_sort(build({"a": 1})) == ["a"]


def test_linear_chain_follows_the_edges_not_the_keys():
    # Keys deliberately oppose the edges: c=1 sorts first but must come last.
    graph = build({"a": 3, "b": 2, "c": 1}, ("b", "a"), ("c", "b"))
    assert topological_sort(graph) == ["a", "b", "c"]


def test_disconnected_components_interleave_by_key():
    graph = build(keys("a", "x", "b", "y"), ("b", "a"), ("y", "x"))
    assert topological_sort(graph) == ["a", "x", "b", "y"]


def test_tie_break_key_orders_otherwise_free_nodes():
    graph = build({"late": 9, "early": 1, "middle": 5})
    assert topological_sort(graph) == ["early", "middle", "late"]


def test_equal_keys_fall_back_to_id_for_a_total_order():
    graph = build({"zulu": 1, "alpha": 1, "mike": 1})
    assert topological_sort(graph) == ["alpha", "mike", "zulu"]


def test_explicit_key_overrides_the_node_key():
    graph = build({"a": 1, "b": 2, "c": 3})
    reversed_key = {"a": 3, "b": 2, "c": 1}
    assert topological_sort(graph, key=reversed_key.__getitem__) == ["c", "b", "a"]


def test_sort_is_deterministic_across_shuffled_input():
    ids = [f"m{i}" for i in range(12)]
    edges = [("m5", "m1"), ("m5", "m2"), ("m8", "m5"), ("m8", "m3"), ("m11", "m8"), ("m7", "m0")]
    expected = topological_sort(build(keys(*ids), *edges))

    rng = random.Random(20260806)
    for _ in range(100):
        shuffled_nodes = list(keys(*ids).items())
        rng.shuffle(shuffled_nodes)
        shuffled_edges = list(edges)
        rng.shuffle(shuffled_edges)
        graph = build(dict(shuffled_nodes), *shuffled_edges)
        assert topological_sort(graph) == expected


def test_curated_order_is_reproduced_when_it_is_itself_valid():
    """The invariant the seed loader relies on.

    If the hand-authored chronological order satisfies every edge, then Kahn
    tie-broken by chrono_order must reproduce it exactly.
    """
    curated = ["first-avenger", "iron-man", "hulk", "iron-man-2", "thor", "avengers"]
    graph = build(
        keys(*curated),
        ("avengers", "iron-man"),
        ("avengers", "thor"),
        ("avengers", "first-avenger"),
        ("avengers", "iron-man-2", "recommended"),
        ("avengers", "hulk", "recommended"),
    )
    assert topological_sort(graph) == curated


# --------------------------------------------------------------------------- #
# Edge-set validation and cycles
# --------------------------------------------------------------------------- #


def test_parallel_edges_do_not_produce_a_false_cycle():
    """The classic Kahn bug: a duplicated edge inflates indegree past zero."""
    graph = build(keys("a", "b"), ("b", "a"), ("b", "a"), ("b", "a"))
    assert topological_sort(graph) == ["a", "b"]
    assert len(graph.edges) == 1


def test_duplicate_edges_resolve_to_the_stronger_declaration():
    for pair in (("recommended", "essential"), ("essential", "recommended")):
        graph = build(keys("a", "b"), ("b", "a", pair[0]), ("b", "a", pair[1]))
        assert graph.strength("a", "b") == "essential"


def test_self_edge_is_rejected_with_the_offending_ids():
    with pytest.raises(SelfEdgeError) as excinfo:
        build(keys("a", "b"), ("a", "a"), ("b", "b"))
    assert excinfo.value.movie_ids == ["a", "b"]


def test_unknown_reference_reports_every_offender_not_just_the_first():
    with pytest.raises(UnknownNodeError) as excinfo:
        build(keys("a"), ("a", "ghost"), ("phantom", "a"))
    assert excinfo.value.references == [("a", "ghost"), ("phantom", "a")]


def test_two_node_cycle_is_reported_as_a_closed_path():
    graph = build(keys("a", "b"), ("a", "b"), ("b", "a"))
    assert find_cycle(graph) == ["a", "b", "a"]


def test_three_node_cycle_is_reported_as_a_closed_path():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"), ("a", "c"))
    assert find_cycle(graph) == ["a", "b", "c", "a"]


def test_acyclic_graph_has_no_cycle():
    assert find_cycle(build(keys("a", "b", "c"), ("b", "a"), ("c", "b"))) is None


def test_sorting_a_cyclic_graph_raises_and_names_the_cycle():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"), ("a", "c"))
    with pytest.raises(CycleError) as excinfo:
        topological_sort(graph)
    assert excinfo.value.cycle == ["a", "b", "c", "a"]
    assert "a -> b -> c -> a" in str(excinfo.value)


def test_cycle_detection_is_unaffected_by_healthy_neighbours():
    graph = build(keys("ok1", "ok2", "a", "b"), ("ok2", "ok1"), ("a", "b"), ("b", "a"))
    assert find_cycle(graph) == ["a", "b", "a"]


# --------------------------------------------------------------------------- #
# Prerequisite closure
# --------------------------------------------------------------------------- #


def test_closure_of_a_root_is_empty():
    assert ancestors(build(keys("a", "b"), ("b", "a")), "a") == set()


def test_closure_deduplicates_across_a_diamond():
    graph = build(keys("a", "b", "c", "d"), ("b", "a"), ("c", "a"), ("d", "b"), ("d", "c"))
    assert ancestors(graph, "d") == {"a", "b", "c"}


def test_closure_terminates_on_a_cyclic_graph():
    graph = build(keys("a", "b"), ("a", "b"), ("b", "a"))
    assert ancestors(graph, "a") == {"a", "b"}


# --------------------------------------------------------------------------- #
# Prerequisite chain
# --------------------------------------------------------------------------- #


def test_chain_includes_the_target_at_depth_zero():
    chain = prerequisite_chain(build(keys("a", "b"), ("b", "a")), "b")
    target = next(n for n in chain.nodes if n.is_target)
    assert target.movie_id == "b"
    assert target.depth == 0
    assert chain.watch_order == ("a",)


def test_chain_of_a_root_is_just_itself():
    chain = prerequisite_chain(build(keys("a", "b"), ("b", "a")), "a")
    assert [n.movie_id for n in chain.nodes] == ["a"]
    assert chain.watch_order == ()
    assert chain.max_depth == 0


def test_depth_uses_the_longest_path_not_the_shortest():
    """A shortcut edge must not drag a node forward into a later column.

    a reaches d directly (length 1) and via b, c (length 3). Drawing a at
    depth 1 would put it to the right of b, and its a->b edge would point
    backwards. Longest path is what prevents that.
    """
    graph = build(keys("a", "b", "c", "d"), ("b", "a"), ("c", "b"), ("d", "c"), ("d", "a"))
    depth = {n.movie_id: n.depth for n in prerequisite_chain(graph, "d").nodes}
    assert depth == {"d": 0, "c": 1, "b": 2, "a": 3}


def test_diamond_yields_one_node_per_title():
    graph = build(keys("a", "b", "c", "d"), ("b", "a"), ("c", "a"), ("d", "b"), ("d", "c"))
    chain = prerequisite_chain(graph, "d")
    ids = [n.movie_id for n in chain.nodes]
    assert sorted(ids) == ["a", "b", "c", "d"]
    assert len(ids) == len(set(ids))
    assert {n.movie_id: n.depth for n in chain.nodes} == {"d": 0, "b": 1, "c": 1, "a": 2}


def test_direct_prerequisites_are_flagged():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"))
    direct = {n.movie_id: n.is_direct for n in prerequisite_chain(graph, "c").nodes}
    assert direct == {"c": False, "b": True, "a": False}


def test_a_recommended_link_downgrades_everything_behind_it():
    graph = build(keys("a", "b", "c"), ("b", "a", "recommended"), ("c", "b"))
    strength = {n.movie_id: n.strength for n in prerequisite_chain(graph, "c").nodes}
    assert strength["b"] == "essential"
    assert strength["a"] == "recommended"


def test_a_second_all_essential_path_keeps_a_node_essential():
    graph = build(keys("a", "b", "c"), ("b", "a", "recommended"), ("c", "b"), ("c", "a"))
    strength = {n.movie_id: n.strength for n in prerequisite_chain(graph, "c").nodes}
    assert strength["a"] == "essential"


def test_watch_order_is_a_valid_topological_order_of_the_chain():
    graph = build(keys("a", "b", "c", "d"), ("b", "a"), ("c", "a"), ("d", "b"), ("d", "c"))
    chain = prerequisite_chain(graph, "d")
    position = {movie_id: index for index, movie_id in enumerate(chain.watch_order)}
    for edge in chain.edges:
        if edge.movie_id in position and edge.prerequisite_id in position:
            assert position[edge.prerequisite_id] < position[edge.movie_id]


def test_chain_ignores_titles_that_merely_depend_on_the_target():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"))
    assert [n.movie_id for n in prerequisite_chain(graph, "b").nodes] == ["b", "a"]


def test_chain_of_an_unknown_title_raises():
    with pytest.raises(KeyError):
        prerequisite_chain(build(keys("a")), "nope")


def test_essential_only_view_drops_recommended_edges():
    graph = build(keys("a", "b", "c"), ("c", "a"), ("c", "b", "recommended"))
    chain = prerequisite_chain(graph.essential_only(), "c")
    assert sorted(n.movie_id for n in chain.nodes) == ["a", "c"]


# --------------------------------------------------------------------------- #
# Repair and completion
# --------------------------------------------------------------------------- #


def test_repair_swaps_the_offending_pair_and_leaves_the_rest():
    graph = build(keys("a", "b", "c"), ("b", "a"))
    assert repair_order(graph, ["b", "a", "c"]) == ["a", "b", "c"]


def test_repair_never_reorders_unconstrained_titles():
    graph = build(keys("a", "b", "c", "d"))
    assert repair_order(graph, ["d", "c", "b", "a"]) == ["d", "c", "b", "a"]


def test_repair_places_each_title_as_early_as_its_prerequisites_allow():
    """The precise guarantee: lexicographically smallest by submitted position.

    Given d, b, c, a with b requiring a, b cannot stay at index 1, so the
    earliest still-available titles fill in ahead of it.
    """
    graph = build(keys("a", "b", "c", "d"), ("b", "a"))
    assert repair_order(graph, ["d", "b", "c", "a"]) == ["d", "c", "a", "b"]


def test_repair_of_a_valid_order_is_the_identity():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"))
    assert repair_order(graph, ["a", "b", "c"]) == ["a", "b", "c"]


def test_completion_pulls_in_the_whole_closure():
    graph = build(keys("a", "b", "c"), ("b", "a"), ("c", "b"))
    assert complete_order(graph, ["c"]) == ["a", "b", "c"]


def test_completed_order_always_validates_clean():
    graph = build(
        keys("a", "b", "c", "d", "e"),
        ("b", "a"),
        ("c", "b"),
        ("d", "a", "recommended"),
        ("e", "c"),
        ("e", "d"),
    )
    result = validate_order(graph, complete_order(graph, ["e"]))
    assert result.is_valid
    assert result.violations == ()


# --------------------------------------------------------------------------- #
# Message formatting
# --------------------------------------------------------------------------- #


def test_out_of_order_message_uses_one_based_positions():
    graph = build(keys("a", "b"), ("b", "a"))
    result = validate_order(graph, ["b", "a"])
    titles = {"a": "Alpha", "b": "Beta"}
    assert format_violation(result.violations[0], titles) == (
        "You have Beta (position 1) before Alpha (position 2)."
    )


def test_missing_message_distinguishes_required_from_recommended():
    graph = build(keys("a", "b", "c"), ("c", "a"), ("c", "b", "recommended"))
    result = validate_order(graph, ["c"])
    titles = {"a": "Alpha", "b": "Beta", "c": "Gamma"}
    rendered = [format_violation(v, titles) for v in result.violations]
    assert rendered == [
        "Alpha is required before Gamma but isn't in this order.",
        "Beta is recommended before Gamma but isn't in this order.",
    ]


def test_message_falls_back_to_the_id_when_a_title_is_unknown():
    graph = build(keys("a", "b"), ("b", "a"))
    result = validate_order(graph, ["b", "a"])
    assert "a" in format_violation(result.violations[0], {})
