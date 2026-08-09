"""The prerequisite DAG engine.

This module is the heart of the application and deliberately depends on nothing
else: no SQLAlchemy, no FastAPI, no pydantic. It takes plain dataclasses and
returns plain dataclasses, which is what lets its tests run in milliseconds with
no fixtures, and what makes the JavaScript port of `validate_order` (used for
live feedback while dragging) a faithful translation rather than a second
implementation. `app.services.ordering` is the only adapter between this module
and the database.

Edge direction convention, used consistently throughout:

    prerequisite_id  ---->  movie_id
    "watch this first"      "watch this after"

so `successors(n)` are the titles unlocked by watching `n`, and
`predecessors(n)` are the titles `n` requires.
"""

from __future__ import annotations

import heapq
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

MovieId = str
Strength = Literal["essential", "recommended"]
SortKey = Any  # any comparable; chrono_order in production, list position when repairing

STRENGTHS: tuple[Strength, ...] = ("essential", "recommended")

_WHITE, _GRAY, _BLACK = 0, 1, 2


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class GraphError(Exception):
    """Base for every structural problem this module can detect."""


class CycleError(GraphError):
    """The edge set contains a cycle, so no watch order can satisfy it."""

    def __init__(self, cycle: Sequence[MovieId]) -> None:
        self.cycle = list(cycle)
        super().__init__("Prerequisite cycle: " + " -> ".join(self.cycle))


class UnknownNodeError(GraphError):
    """An edge references a title that does not exist.

    Carries *every* offending reference rather than just the first, so a single
    seed run tells the author everything they need to fix.
    """

    def __init__(self, references: Sequence[tuple[MovieId, MovieId]]) -> None:
        self.references = list(references)
        detail = ", ".join(f"{dep!r} -> unknown {prereq!r}" for dep, prereq in self.references)
        super().__init__(f"Edges reference unknown titles: {detail}")


class SelfEdgeError(GraphError):
    """A title lists itself as its own prerequisite."""

    def __init__(self, movie_ids: Sequence[MovieId]) -> None:
        self.movie_ids = list(movie_ids)
        super().__init__("Titles listed as their own prerequisite: " + ", ".join(self.movie_ids))


# --------------------------------------------------------------------------- #
# Core types
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class Edge:
    movie_id: MovieId  # the dependent -- watched after
    prerequisite_id: MovieId  # watched first
    strength: Strength = "essential"
    note: str | None = None


class Graph:
    """An immutable prerequisite DAG with adjacency precomputed once.

    Build via :meth:`build`, which validates the edge set and collapses parallel
    edges. Nothing here mutates after construction.
    """

    __slots__ = ("_nodes", "_edges", "_successors", "_predecessors", "_strength_by_pair")

    def __init__(
        self,
        nodes: Mapping[MovieId, SortKey],
        edges: tuple[Edge, ...],
        successors: Mapping[MovieId, tuple[MovieId, ...]],
        predecessors: Mapping[MovieId, tuple[MovieId, ...]],
        strength_by_pair: Mapping[tuple[MovieId, MovieId], Strength],
    ) -> None:
        self._nodes = dict(nodes)
        self._edges = edges
        self._successors = dict(successors)
        self._predecessors = dict(predecessors)
        self._strength_by_pair = dict(strength_by_pair)

    # -- construction ------------------------------------------------------- #

    @classmethod
    def build(cls, nodes: Mapping[MovieId, SortKey], edges: Iterable[Edge]) -> Graph:
        """Validate and index an edge set.

        Raises :class:`SelfEdgeError` and :class:`UnknownNodeError` -- both
        collect *all* offenders before raising. Cycles are not detected here
        because a cycle is only meaningful once you try to order the graph;
        :func:`topological_sort` reports those.

        Parallel edges are collapsed. When duplicates disagree on strength the
        stronger one wins, so a title declared essential somewhere is never
        silently downgraded by a stray duplicate.
        """
        known = set(nodes)
        self_edges: list[MovieId] = []
        unknown: list[tuple[MovieId, MovieId]] = []
        best: dict[tuple[MovieId, MovieId], Edge] = {}

        for edge in edges:
            if edge.movie_id == edge.prerequisite_id:
                self_edges.append(edge.movie_id)
                continue
            if edge.movie_id not in known or edge.prerequisite_id not in known:
                unknown.append((edge.movie_id, edge.prerequisite_id))
                continue

            pair = (edge.prerequisite_id, edge.movie_id)
            existing = best.get(pair)
            upgrades = edge.strength == "essential" and existing is not None
            if existing is None or (upgrades and existing.strength != "essential"):
                best[pair] = edge

        if self_edges:
            raise SelfEdgeError(sorted(set(self_edges)))
        if unknown:
            raise UnknownNodeError(sorted(set(unknown)))

        successors: dict[MovieId, list[MovieId]] = {n: [] for n in nodes}
        predecessors: dict[MovieId, list[MovieId]] = {n: [] for n in nodes}
        strength_by_pair: dict[tuple[MovieId, MovieId], Strength] = {}

        for (prereq, dep), edge in best.items():
            successors[prereq].append(dep)
            predecessors[dep].append(prereq)
            strength_by_pair[(prereq, dep)] = edge.strength

        # Sorting adjacency lists makes every traversal in this module
        # order-independent of dict insertion order, which is what makes the
        # determinism tests meaningful rather than incidental.
        return cls(
            nodes=nodes,
            edges=tuple(sorted(best.values(), key=lambda e: (e.prerequisite_id, e.movie_id))),
            successors={n: tuple(sorted(v)) for n, v in successors.items()},
            predecessors={n: tuple(sorted(v)) for n, v in predecessors.items()},
            strength_by_pair=strength_by_pair,
        )

    # -- accessors ---------------------------------------------------------- #

    @property
    def nodes(self) -> Mapping[MovieId, SortKey]:
        return self._nodes

    @property
    def edges(self) -> tuple[Edge, ...]:
        return self._edges

    def __contains__(self, movie_id: object) -> bool:
        return movie_id in self._nodes

    def __len__(self) -> int:
        return len(self._nodes)

    def successors(self, movie_id: MovieId) -> tuple[MovieId, ...]:
        """Titles unlocked by watching `movie_id`."""
        return self._successors.get(movie_id, ())

    def predecessors(self, movie_id: MovieId) -> tuple[MovieId, ...]:
        """Titles that `movie_id` requires directly."""
        return self._predecessors.get(movie_id, ())

    def strength(self, prerequisite_id: MovieId, movie_id: MovieId) -> Strength | None:
        return self._strength_by_pair.get((prerequisite_id, movie_id))

    def sort_key(self, movie_id: MovieId) -> SortKey:
        return self._nodes[movie_id]

    # -- derived graphs ----------------------------------------------------- #

    def subgraph(self, movie_ids: Iterable[MovieId]) -> Graph:
        """The graph induced on `movie_ids`, keeping only edges with both ends inside."""
        keep = {m for m in movie_ids if m in self._nodes}
        return Graph.build(
            nodes={m: self._nodes[m] for m in keep},
            edges=[e for e in self._edges if e.movie_id in keep and e.prerequisite_id in keep],
        )

    def essential_only(self) -> Graph:
        """Same nodes, but only the edges a viewer genuinely cannot skip."""
        return Graph.build(
            nodes=self._nodes,
            edges=[e for e in self._edges if e.strength == "essential"],
        )

    def rekeyed(self, key: Callable[[MovieId], SortKey]) -> Graph:
        """Same structure with a different tie-break key."""
        return Graph(
            nodes={n: key(n) for n in self._nodes},
            edges=self._edges,
            successors=self._successors,
            predecessors=self._predecessors,
            strength_by_pair=self._strength_by_pair,
        )


# --------------------------------------------------------------------------- #
# Ordering
# --------------------------------------------------------------------------- #


def topological_sort(
    graph: Graph, key: Callable[[MovieId], SortKey] | None = None
) -> list[MovieId]:
    """Kahn's algorithm, made deterministic by a min-heap on the tie-break key.

    Determinism is not cosmetic. Responses get cached and bookmarked, tests
    assert exact sequences, and a "your order differs from the suggested one"
    diff is meaningless if the suggested order drifts between runs. The heap
    entry is `(key, id)` rather than bare `key` so the order stays total even
    when two titles share a key.

    With the default key (`chrono_order`) this reproduces the curated
    chronological order exactly, provided that order is itself valid -- which is
    an invariant the seed loader asserts.

    Raises :class:`CycleError`, naming the actual cycle.
    """
    sort_key = key or graph.sort_key

    indegree = {n: len(graph.predecessors(n)) for n in graph.nodes}
    heap = [(sort_key(n), n) for n, d in indegree.items() if d == 0]
    heapq.heapify(heap)

    order: list[MovieId] = []
    while heap:
        _, node = heapq.heappop(heap)
        order.append(node)
        for dependent in graph.successors(node):
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                heapq.heappush(heap, (sort_key(dependent), dependent))

    if len(order) != len(graph.nodes):
        # Only pay for cycle reconstruction when there is actually a cycle.
        raise CycleError(find_cycle(graph) or [])
    return order


def find_cycle(graph: Graph) -> list[MovieId] | None:
    """Return one cycle as a closed path (`[a, b, c, a]`), or None if acyclic.

    Iterative colored DFS rather than recursive: the same function runs at seed
    time against hand-authored files, where a pathological input should produce
    an error message, not a RecursionError. Roots and successors are visited in
    sorted order so the reported cycle is stable across runs.
    """
    color = dict.fromkeys(graph.nodes, _WHITE)
    parent: dict[MovieId, MovieId | None] = {}

    for start in sorted(graph.nodes):
        if color[start] != _WHITE:
            continue

        color[start] = _GRAY
        parent[start] = None
        stack: list[tuple[MovieId, Any]] = [(start, iter(graph.successors(start)))]

        while stack:
            node, successors = stack[-1]
            descended = False

            for nxt in successors:
                if color[nxt] == _WHITE:
                    color[nxt] = _GRAY
                    parent[nxt] = node
                    stack.append((nxt, iter(graph.successors(nxt))))
                    descended = True
                    break
                if color[nxt] == _GRAY:
                    # Back edge: nxt is an ancestor of node on the current path.
                    path = [node]
                    cursor = parent[node]
                    while cursor is not None and cursor != nxt:
                        path.append(cursor)
                        cursor = parent[cursor]
                    path.append(nxt)
                    path.reverse()
                    path.append(nxt)
                    return path

            if not descended:
                color[node] = _BLACK
                stack.pop()

    return None


def ancestors(graph: Graph, target: MovieId) -> set[MovieId]:
    """Every title reachable backwards from `target` -- its full prerequisite closure.

    The visited set *is* the memoization: each node is expanded exactly once, so
    this is O(V+E) rather than exponential. That matters here specifically
    because the MCU graph is extremely diamond-shaped -- almost every late-phase
    path funnels through Infinity War and Endgame -- and a naive re-walk would
    revisit the early phases thousands of times.

    Terminates even on a cyclic graph; ordering the result is what surfaces cycles.
    """
    seen: set[MovieId] = set()
    stack = [target]
    while stack:
        for prereq in graph.predecessors(stack.pop()):
            if prereq not in seen:
                seen.add(prereq)
                stack.append(prereq)
    return seen


# --------------------------------------------------------------------------- #
# Prerequisite chain
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class ChainNode:
    movie_id: MovieId
    depth: int
    strength: Strength
    is_direct: bool
    is_target: bool


@dataclass(frozen=True, slots=True)
class PrerequisiteChain:
    target: MovieId
    nodes: tuple[ChainNode, ...]
    edges: tuple[Edge, ...]
    watch_order: tuple[MovieId, ...]
    max_depth: int

    @property
    def essential_ids(self) -> tuple[MovieId, ...]:
        return tuple(
            n.movie_id for n in self.nodes if n.strength == "essential" and not n.is_target
        )


def prerequisite_chain(graph: Graph, target: MovieId) -> PrerequisiteChain:
    """Everything you must watch before `target`, laid out for drawing.

    Returns a graph rather than a list, because the visualization is the point.
    Each node carries:

    * `depth` -- distance from the target measured by **longest** path, not
      shortest. Longest path is what guarantees a node is drawn strictly further
      from the target than everything that depends on it; with shortest path,
      edges visually skip backwards over intervening columns. This is Sugiyama's
      longest-path layer assignment, and computing it here means the frontend
      does no graph math at all.
    * `strength` -- essential if *some* path from this node to the target uses
      only essential edges. A single recommended link anywhere along a path
      makes that path optional, but another all-essential path can still keep
      the node essential.
    """
    if target not in graph:
        raise KeyError(target)

    closure = ancestors(graph, target)
    induced = graph.subgraph(closure | {target})

    # Prerequisites first, dependents last. Restricting to the induced subgraph
    # rather than filtering a global sort is equivalent -- the closure is closed
    # under predecessors, so no title outside it can constrain one inside -- and
    # it means an unrelated cycle elsewhere in the catalog cannot break this call.
    order = topological_sort(induced)

    depth: dict[MovieId, int] = {target: 0}
    essential: dict[MovieId, bool] = {target: True}

    # Reverse topological order: every dependent is settled before the node it
    # depends on, which is exactly what both recurrences need.
    for node in reversed(order):
        if node == target:
            continue
        dependents = induced.successors(node)
        depth[node] = 1 + max(depth[d] for d in dependents)
        essential[node] = any(
            essential[d] and induced.strength(node, d) == "essential" for d in dependents
        )

    direct = set(graph.predecessors(target))
    nodes = tuple(
        ChainNode(
            movie_id=node,
            depth=depth[node],
            strength="essential" if essential[node] else "recommended",
            is_direct=node in direct,
            is_target=node == target,
        )
        for node in sorted(order, key=lambda n: (depth[n], induced.sort_key(n), n))
    )

    return PrerequisiteChain(
        target=target,
        nodes=nodes,
        edges=induced.edges,
        watch_order=tuple(n for n in order if n != target),
        max_depth=max(depth.values()) if depth else 0,
    )


# --------------------------------------------------------------------------- #
# Custom order validation
# --------------------------------------------------------------------------- #

ViolationKind = Literal["out_of_order", "missing_prerequisite"]
Severity = Literal["error", "warning"]


@dataclass(frozen=True, slots=True)
class Violation:
    kind: ViolationKind
    severity: Severity
    movie_id: MovieId
    prerequisite_id: MovieId
    strength: Strength
    movie_position: int | None
    prerequisite_position: int | None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    is_valid: bool
    has_warnings: bool
    checked_count: int
    violations: tuple[Violation, ...]
    missing_prerequisite_ids: tuple[MovieId, ...]
    suggested_order: tuple[MovieId, ...]
    unknown_ids: tuple[MovieId, ...]
    duplicate_ids: tuple[MovieId, ...]


def validate_order(graph: Graph, order: Sequence[MovieId]) -> ValidationResult:
    """Check a user-built order against the DAG.

    One O(E) pass over the direct edges. No topological sort is needed for the
    check itself -- comparing positions in a lookup map *is* the check, and
    unlike a sort it yields a per-edge diagnostic the UI can point at.

    Only **direct** edges are reported. Checking the transitive closure would
    turn one misplaced title into dozens of redundant messages ("Endgame before
    Iron Man", "Endgame before Thor", ...); the direct edges give the minimal
    human-readable set, and fixing them satisfies the transitive constraints
    automatically.

    A prerequisite that is absent from the list entirely is a distinct `kind`,
    not an error, because a partial order ("just the Captain America films") is
    a legitimate thing to build. Severity follows edge strength: a missing or
    misplaced *essential* prerequisite is an error, a *recommended* one is a
    warning, and `is_valid` counts only errors.
    """
    seen: set[MovieId] = set()
    duplicates: list[MovieId] = []
    unknown: list[MovieId] = []
    cleaned: list[MovieId] = []

    for movie_id in order:
        if movie_id in seen:
            duplicates.append(movie_id)
            continue
        seen.add(movie_id)
        if movie_id not in graph:
            unknown.append(movie_id)
            continue
        cleaned.append(movie_id)

    position = {movie_id: index for index, movie_id in enumerate(cleaned)}

    violations: list[Violation] = []
    missing: set[MovieId] = set()

    for edge in graph.edges:
        if edge.movie_id not in position:
            continue  # the dependent is not in this list, so the edge does not apply
        severity: Severity = "error" if edge.strength == "essential" else "warning"

        if edge.prerequisite_id not in position:
            missing.add(edge.prerequisite_id)
            violations.append(
                Violation(
                    kind="missing_prerequisite",
                    severity=severity,
                    movie_id=edge.movie_id,
                    prerequisite_id=edge.prerequisite_id,
                    strength=edge.strength,
                    movie_position=position[edge.movie_id],
                    prerequisite_position=None,
                )
            )
        elif position[edge.prerequisite_id] > position[edge.movie_id]:
            violations.append(
                Violation(
                    kind="out_of_order",
                    severity=severity,
                    movie_id=edge.movie_id,
                    prerequisite_id=edge.prerequisite_id,
                    strength=edge.strength,
                    movie_position=position[edge.movie_id],
                    prerequisite_position=position[edge.prerequisite_id],
                )
            )

    violations.sort(key=lambda v: (v.movie_position or 0, v.prerequisite_id))

    return ValidationResult(
        is_valid=not any(v.severity == "error" for v in violations),
        has_warnings=any(v.severity == "warning" for v in violations),
        checked_count=len(cleaned),
        violations=tuple(violations),
        missing_prerequisite_ids=tuple(sorted(missing)),
        suggested_order=tuple(repair_order(graph, cleaned)),
        unknown_ids=tuple(unknown),
        duplicate_ids=tuple(duplicates),
    )


def repair_order(graph: Graph, order: Sequence[MovieId]) -> list[MovieId]:
    """The minimal-surprise fix: the same titles, reordered as little as possible.

    Runs Kahn over the submitted set but tie-breaks by the user's *own* position
    instead of chronological order, which yields the lexicographically smallest
    valid order with respect to where they put things: every title lands as
    early as its prerequisites allow, in their priority. That reads as "I kept
    your arrangement and moved what had to move", rather than replacing their
    work with the canonical order.

    This reorders; it never adds. A prerequisite absent from the list stays
    absent -- filling those in is :func:`complete_order`.
    """
    known = [m for m in dict.fromkeys(order) if m in graph]
    position = {movie_id: index for index, movie_id in enumerate(known)}
    return topological_sort(graph.subgraph(known), key=position.__getitem__)


def complete_order(graph: Graph, order: Sequence[MovieId]) -> list[MovieId]:
    """Add every missing prerequisite and return a valid order.

    Powers the "add all missing prerequisites" button. User-chosen titles keep
    their relative order wherever the DAG allows; injected prerequisites are
    pulled in only when the order would otherwise be blocked, which lands them
    directly before the titles that needed them.
    """
    known = [m for m in dict.fromkeys(order) if m in graph]
    position = {movie_id: index for index, movie_id in enumerate(known)}

    required = set(known)
    for movie_id in known:
        required |= ancestors(graph, movie_id)

    def key(movie_id: MovieId) -> tuple[int, SortKey]:
        if movie_id in position:
            return (0, position[movie_id])
        return (1, graph.sort_key(movie_id))

    return topological_sort(graph.subgraph(required), key=key)


# --------------------------------------------------------------------------- #
# Presentation helper
# --------------------------------------------------------------------------- #


def format_violation(violation: Violation, titles: Mapping[MovieId, str]) -> str:
    """Render a violation as a sentence.

    Lives here, next to the rule it describes, so that the Python API and the
    JavaScript port stay word-for-word identical -- users see the same message
    whether it came from a live drag or from the server on save. Positions are
    1-based in prose and 0-based in the data.
    """
    movie = titles.get(violation.movie_id, violation.movie_id)
    prerequisite = titles.get(violation.prerequisite_id, violation.prerequisite_id)

    if violation.kind == "missing_prerequisite":
        verb = "is required" if violation.strength == "essential" else "is recommended"
        return f"{prerequisite} {verb} before {movie} but isn't in this order."

    movie_position = (violation.movie_position or 0) + 1
    prerequisite_position = (violation.prerequisite_position or 0) + 1
    return (
        f"You have {movie} (position {movie_position}) before "
        f"{prerequisite} (position {prerequisite_position})."
    )
