"""Recommended viewing orders: the ones worth offering beside a user's own.

Two kinds, deliberately kept apart:

* **computed** orders are rules over the catalog -- release order, story order,
  a saga, a tier, the prerequisite road to one film. They are built here on
  every startup, so a title added to the seed file joins every order it
  belongs in without anyone remembering to put it there.
* **curated** orders reproduce somebody else's list -- Disney+'s timeline, a
  published guide -- and live in `seed/data/recommended_orders.json` with the
  sources they came from. A rule cannot reproduce an editorial choice, so these
  are data, and they are checked against the catalog the same way the seed is.

Both come out in one shape, so the API and the UI never need to know which is
which except to say where a list came from.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.catalog import Catalog, Title, get_catalog
from app.core.enums import MCU_UNIVERSES
from app.core.graph import repair_order, validate_order
from app.seed.schema import SeedValidationError, Slug

CURATED_PATH = Path(__file__).resolve().parents[1] / "seed" / "data" / "recommended_orders.json"

# The film every road currently leads to.
DOOMSDAY = "avengers-doomsday"

# One-Shots are filed as films but run ten minutes; a "films" list means features.
FEATURE_MINUTES = 60


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    label: str = Field(max_length=200)
    url: str = Field(pattern=r"^https://", max_length=500)


class CuratedOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Slug
    name: str = Field(max_length=80)
    tagline: str = Field(max_length=140)
    description: str = Field(max_length=1200)
    sources: list[Source] = Field(default_factory=list)
    movie_ids: list[Slug] = Field(min_length=1)


class CuratedFile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: int
    orders: list[CuratedOrder]


@dataclass(frozen=True, slots=True)
class RecommendedOrder:
    id: str
    name: str
    tagline: str
    description: str
    kind: str
    sources: tuple[Source, ...]
    movie_ids: tuple[str, ...]
    runtime_min: int
    # Prerequisites the order puts *after* the title that needs them. The one
    # number that says an order is out of step with the graph; skipped
    # prerequisites are counted separately, since a short list skips by design.
    out_of_order: int
    skipped_essentials: int


def _in_mcu(title: Title) -> bool:
    return title.universe in MCU_UNIVERSES


def _is_feature(title: Title) -> bool:
    return title.media_type == "film" and (title.runtime_min or 0) >= FEATURE_MINUTES


@dataclass(frozen=True, slots=True)
class _Rule:
    id: str
    name: str
    tagline: str
    description: str
    build: Callable[[Catalog], list[str]]


def _road_to(target: str) -> Callable[[Catalog], list[str]]:
    """Everything `target` needs, essential links only, then it.

    Release order, nudged by `repair_order` wherever a title came out before
    something it leans on (The Incredible Hulk before The First Avenger), so
    an order built from the graph never disagrees with the graph.
    """

    def build(catalog: Catalog) -> list[str]:
        if target not in catalog:
            return []
        needed: set[str] = set()
        stack = [target]
        while stack:
            for link in catalog.prerequisites_of(stack.pop()):
                if link.strength == "essential" and link.prerequisite_id not in needed:
                    needed.add(link.prerequisite_id)
                    stack.append(link.prerequisite_id)
        in_release = [title.id for title in catalog.all() if title.id in needed] + [target]
        return repair_order(catalog.graph, in_release)

    return build


RULES: tuple[_Rule, ...] = (
    _Rule(
        id="release",
        name="Release order",
        tagline="The order it came out in, and the order it was written to be seen in.",
        description=(
            "Every Marvel Studios film and series in release order, starting with Iron Man. "
            "Twists land as they were meant to, post-credits scenes tease what really is "
            "next, and nothing assumes knowledge it has not given you yet. The usual advice "
            "for a first watch."
        ),
        build=lambda catalog: [t.id for t in catalog.all() if _in_mcu(t)],
    ),
    _Rule(
        id="story",
        name="Story order",
        tagline="The in-universe timeline, from 1942 onwards.",
        description=(
            "The same titles, ordered by when they happen: Captain America in the war, "
            "Agent Carter after it, Captain Marvel in the nineties, and so on. Best on a "
            "rewatch, when spoiling a reveal costs nothing. This is the catalog's own "
            "curated chronology, which every prerequisite agrees with."
        ),
        build=lambda catalog: [t.id for t in catalog.in_chronological_order() if _in_mcu(t)],
    ),
    _Rule(
        id="infinity-saga-essentials",
        name="Infinity Saga essentials",
        tagline="Iron Man to Far From Home, core films only.",
        description=(
            "Only the films this catalog rates core to the Infinity Saga, in release order. "
            "The spine of Phases 1 to 3 without the side stories: enough for every "
            "Endgame payoff to land."
        ),
        build=lambda catalog: [
            t.id
            for t in catalog.all()
            if t.saga == "Infinity Saga" and t.tier == "core" and _is_feature(t) and _in_mcu(t)
        ],
    ),
    _Rule(
        id="films-only",
        name="Films only",
        tagline="Every Marvel Studios feature, no homework.",
        description=(
            "The films in release order and nothing else: no series, no specials, no "
            "One-Shots. The films reference the shows now and then, but none of them "
            "depends on one to make sense."
        ),
        build=lambda catalog: [
            t.id for t in catalog.all() if _is_feature(t) and _in_mcu(t) and t.phase is not None
        ],
    ),
    _Rule(
        id="multiverse-saga",
        name="Multiverse Saga",
        tagline="Phases 4 to 6, from WandaVision on.",
        description=(
            "Everything Marvel Studios has made since Endgame, in release order: for "
            "anyone who stopped after the Infinity Saga and wants to pick the thread "
            "back up."
        ),
        build=lambda catalog: [
            t.id for t in catalog.all() if t.saga == "Multiverse Saga" and _in_mcu(t)
        ],
    ),
    _Rule(
        id="road-to-doomsday",
        name="Road to Doomsday",
        tagline="Everything Avengers: Doomsday needs, and nothing it does not.",
        description=(
            "Built from this catalog's own prerequisite graph: every title Avengers: "
            "Doomsday depends on, following essential links only, in release order. "
            "Longer than a quick catch-up, but nothing on it is optional."
        ),
        build=_road_to(DOOMSDAY),
    ),
)


def read_curated(path: Path = CURATED_PATH) -> list[CuratedOrder]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return CuratedFile.model_validate(raw).orders
    except (OSError, json.JSONDecodeError) as exc:
        raise SeedValidationError([f"{path.name}: {exc}"]) from exc
    except ValidationError as exc:
        raise SeedValidationError(
            [f"{path.name}: {'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]
        ) from exc


def _summarise(catalog: Catalog, movie_ids: list[str]) -> tuple[int, int, int]:
    runtime = sum((catalog.get(movie_id).runtime_min or 0) for movie_id in movie_ids)
    result = validate_order(catalog.graph, movie_ids)
    out_of_order = sum(1 for v in result.violations if v.kind == "out_of_order")
    skipped = sum(
        1
        for v in result.violations
        if v.kind == "missing_prerequisite" and v.strength == "essential"
    )
    return runtime, out_of_order, skipped


def build_recommended(catalog: Catalog, curated: list[CuratedOrder]) -> list[RecommendedOrder]:
    """Computed orders first, then curated ones. Raises on any unknown or repeated id."""
    problems: list[str] = []
    seen_ids: set[str] = {rule.id for rule in RULES}
    for order in curated:
        if order.id in seen_ids:
            problems.append(f"recommended order id {order.id!r} is used twice")
        seen_ids.add(order.id)
        unknown = [movie_id for movie_id in order.movie_ids if movie_id not in catalog]
        if unknown:
            problems.append(f"{order.id}: unknown title ids {', '.join(unknown)}")
        if len(set(order.movie_ids)) != len(order.movie_ids):
            problems.append(f"{order.id}: lists a title twice")
    if problems:
        raise SeedValidationError(problems)

    orders: list[RecommendedOrder] = []
    entries = [(rule, "computed", rule.build(catalog), ()) for rule in RULES] + [
        (order, "curated", list(order.movie_ids), tuple(order.sources)) for order in curated
    ]
    for entry, kind, movie_ids, sources in entries:
        if not movie_ids:
            continue
        runtime, out_of_order, skipped = _summarise(catalog, movie_ids)
        orders.append(
            RecommendedOrder(
                id=entry.id,
                name=entry.name,
                tagline=entry.tagline,
                description=entry.description,
                kind=kind,
                sources=sources,
                movie_ids=tuple(movie_ids),
                runtime_min=runtime,
                out_of_order=out_of_order,
                skipped_essentials=skipped,
            )
        )
    return orders


@lru_cache
def get_recommended_orders() -> tuple[RecommendedOrder, ...]:
    return tuple(build_recommended(get_catalog(), read_curated()))

