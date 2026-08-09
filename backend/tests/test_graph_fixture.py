"""Conformance tests against the cross-language fixture.

`fixtures/validation_cases.json` is also consumed by the frontend's Vitest
suite. The frontend ships its own copy of the validator so that drag-and-drop
feedback is instant rather than a round trip, and this shared fixture is the
only thing keeping the two implementations from drifting apart. A failure here
means either the rule changed on one side only, or the fixture's hand-derived
expectation is wrong -- both worth stopping for.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from app.core.graph import Edge, Graph, complete_order, format_violation, validate_order

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "validation_cases.json"
FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

GRAPH = Graph.build(
    nodes=FIXTURE["graph"]["nodes"],
    edges=[
        Edge(
            movie_id=e["movie_id"],
            prerequisite_id=e["prerequisite_id"],
            strength=e.get("strength", "essential"),
        )
        for e in FIXTURE["graph"]["edges"]
    ],
)
TITLES = FIXTURE["titles"]


def case_id(case: dict) -> str:
    return case["name"]


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=case_id)
def test_validation_matches_the_shared_fixture(case: dict) -> None:
    expected = case["expected"]
    result = validate_order(GRAPH, case["order"])

    assert result.is_valid == expected["is_valid"]
    assert result.has_warnings == expected["has_warnings"]
    assert result.checked_count == expected["checked_count"]
    assert [asdict(v) for v in result.violations] == expected["violations"]
    assert list(result.missing_prerequisite_ids) == expected["missing_prerequisite_ids"]
    assert list(result.unknown_ids) == expected["unknown_ids"]
    assert list(result.duplicate_ids) == expected["duplicate_ids"]
    assert list(result.suggested_order) == expected["suggested_order"]
    assert [format_violation(v, TITLES) for v in result.violations] == expected["messages"]


@pytest.mark.parametrize("case", FIXTURE["completion_cases"], ids=case_id)
def test_completion_matches_the_shared_fixture(case: dict) -> None:
    assert complete_order(GRAPH, case["order"]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["completion_cases"], ids=case_id)
def test_completed_orders_have_no_violations(case: dict) -> None:
    result = validate_order(GRAPH, complete_order(GRAPH, case["order"]))
    assert result.violations == ()


def test_suggested_order_resolves_every_ordering_violation():
    """A reordering can fix sequence, but it cannot conjure absent titles.

    So the guarantee is narrower than "the suggestion is valid": the suggestion
    never leaves an `out_of_order` violation behind. Anything still missing is
    `complete_order`'s job, surfaced in the UI as a separate "add all missing
    prerequisites" action.
    """
    for case in FIXTURE["cases"]:
        suggested = list(validate_order(GRAPH, case["order"]).suggested_order)
        recheck = validate_order(GRAPH, suggested)
        assert [v for v in recheck.violations if v.kind == "out_of_order"] == [], case["name"]


def test_suggested_order_preserves_the_submitted_set():
    """It is a repair, not a replacement -- no title appears or disappears."""
    for case in FIXTURE["cases"]:
        result = validate_order(GRAPH, case["order"])
        submitted = {m for m in case["order"] if m in GRAPH}
        assert set(result.suggested_order) == submitted, case["name"]
