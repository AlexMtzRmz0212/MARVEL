"""Wrap the pure validator with the title lookups the UI needs."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from app.core.graph import Graph, format_violation, validate_order
from app.schemas.order import ValidationResult, Violation


def build_validation_result(
    graph: Graph, titles: Mapping[str, str], order: Sequence[str]
) -> ValidationResult:
    result = validate_order(graph, order)

    return ValidationResult(
        is_valid=result.is_valid,
        has_warnings=result.has_warnings,
        checked_count=result.checked_count,
        violations=[
            Violation(
                kind=violation.kind,
                severity=violation.severity,
                movie_id=violation.movie_id,
                movie_title=titles.get(violation.movie_id, violation.movie_id),
                prerequisite_id=violation.prerequisite_id,
                prerequisite_title=titles.get(
                    violation.prerequisite_id, violation.prerequisite_id
                ),
                strength=violation.strength,
                movie_position=violation.movie_position,
                prerequisite_position=violation.prerequisite_position,
                # Composed by the same function the JavaScript port mirrors, so
                # a live drag and a server response word things identically.
                message=format_violation(violation, titles),
            )
            for violation in result.violations
        ],
        missing_prerequisite_ids=list(result.missing_prerequisite_ids),
        suggested_order=list(result.suggested_order),
        unknown_ids=list(result.unknown_ids),
        duplicate_ids=list(result.duplicate_ids),
    )
