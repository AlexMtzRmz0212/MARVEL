"""Treat the curated catalog as a checked artifact, not just data.

These run the real seed file through the real validator, so a bad edit fails in
CI rather than at deploy time. No database is involved.
"""

from __future__ import annotations

import pytest

from app.core.graph import prerequisite_chain, topological_sort, validate_order
from app.seed.loader import DEFAULT_SEED_PATH, load_and_validate, movie_rows

CATALOG = load_and_validate(DEFAULT_SEED_PATH)


def test_the_seed_file_is_structurally_valid():
    assert CATALOG.movies, "catalog is empty"
    assert CATALOG.edges, "catalog has no prerequisite edges"


def test_the_curated_chronological_order_satisfies_every_edge():
    order = [movie.id for movie in CATALOG.movies]
    result = validate_order(CATALOG.graph, order)
    assert result.violations == ()
    assert result.is_valid


def test_topological_sort_reproduces_the_curated_order_exactly():
    """The invariant that makes chrono_order usable as the global tie-break key."""
    assert topological_sort(CATALOG.graph) == [movie.id for movie in CATALOG.movies]


def test_chrono_order_is_dense_and_zero_based():
    assert sorted(CATALOG.chrono_order.values()) == list(range(len(CATALOG.movies)))


def test_release_order_matches_a_release_date_sort():
    by_release = sorted(CATALOG.movies, key=lambda m: (m.release_date, m.id))
    assert [m.id for m in by_release] == sorted(
        CATALOG.release_order, key=lambda movie_id: CATALOG.release_order[movie_id]
    )


def test_ids_are_unique():
    ids = [movie.id for movie in CATALOG.movies]
    assert len(ids) == len(set(ids))


def test_release_order_starts_with_iron_man():
    """Iron Man opens *Marvel Studios'* release order.

    Tier B (Fox, Sony, Netflix, ABC, ...) titles append to the same array with
    their own universe, and several -- X-Men (2000) chief among them -- release
    earlier than Iron Man. So this checks the Infinity/Multiverse Saga slice
    specifically, not `CATALOG.release_order` as a whole.
    """
    core = [m for m in CATALOG.movies if m.saga.value in {"Infinity Saga", "Multiverse Saga"}]
    first = min(core, key=lambda movie: CATALOG.release_order[movie.id])
    assert first.id == "iron-man"


def test_chronological_order_starts_in_the_1940s_then_1995():
    order = [movie.id for movie in CATALOG.movies]
    assert order[:11] == [
        "captain-america-the-first-avenger",
        "agent-carter-one-shot",
        "agent-carter-season-one",
        "agent-carter-season-two",
        "x-men-first-class",
        "the-fantastic-four-first-steps",
        "x-men-days-of-future-past",
        "x-men-origins-wolverine",
        "x-men-apocalypse",
        "x-men-dark-phoenix",
        "captain-marvel",
    ]


def test_films_have_a_runtime_and_series_runtimes_are_season_totals():
    """A series either carries a whole-season total or nothing at all.

    `enrich_tmdb.py` sums episode runtimes where TMDb exposes them, so the field
    means minutes-for-the-season. The floor is what distinguishes that from a
    single episode length written into the same field by mistake -- the shortest
    season in the catalog is still several hours long.
    """
    for movie in CATALOG.movies:
        if movie.media_type.value == "film":
            assert movie.runtime_min, f"{movie.id} is a film with no runtime"
        elif movie.media_type.value == "series" and movie.runtime_min is not None:
            assert movie.runtime_min > 120, (
                f"{movie.id} has a series runtime of {movie.runtime_min} min, which reads as "
                f"one episode rather than a season total"
            )


def test_mcu_titles_all_carry_a_phase():
    """Only the two core sagas carry phase semantics -- see `test_phase_and_saga_agree`.

    Franchise tags (Fox X-Men Saga, Defenders Saga, the 'Era' sagas covering
    Marvel TV's ABC/Netflix run, ...) sit outside Marvel Studios' own phase
    numbering regardless of how central the title is to its own continuity, so
    `tier` is not the right signal here -- `saga` is.
    """
    phased_sagas = {"Infinity Saga", "Multiverse Saga"}
    for movie in CATALOG.movies:
        if movie.saga.value in phased_sagas:
            assert movie.phase is not None, f"{movie.id} has no phase"


def test_phase_and_saga_agree():
    for movie in CATALOG.movies:
        if movie.tier.value == "adjacent" or movie.phase is None:
            continue
        expected = "Infinity Saga" if movie.phase <= 3 else "Multiverse Saga"
        assert movie.saga.value == expected, f"{movie.id}: phase {movie.phase} vs {movie.saga}"


def test_phases_do_not_overlap_in_release_date():
    """Phases are release-order groupings, so their date ranges cannot interleave.

    A title filed under the wrong phase almost always shows up here.
    """
    by_phase: dict[int, list] = {}
    for movie in CATALOG.movies:
        if movie.phase is not None:
            by_phase.setdefault(movie.phase, []).append(movie.release_date)

    phases = sorted(by_phase)
    for earlier, later in zip(phases, phases[1:], strict=False):
        assert max(by_phase[earlier]) < min(by_phase[later]), (
            f"phase {earlier} ends {max(by_phase[earlier])} but "
            f"phase {later} starts {min(by_phase[later])}"
        )


@pytest.mark.parametrize(
    ("target", "expected_direct"),
    [
        ("avengers-endgame", "avengers-infinity-war"),
        ("spider-man-no-way-home", "spider-man-far-from-home"),
        ("guardians-of-the-galaxy-vol-2", "guardians-of-the-galaxy"),
    ],
)
def test_known_direct_prerequisites(target: str, expected_direct: str):
    chain = prerequisite_chain(CATALOG.graph, target)
    direct = {node.movie_id for node in chain.nodes if node.is_direct}
    assert expected_direct in direct


def test_endgame_pulls_in_most_of_the_infinity_saga():
    chain = prerequisite_chain(CATALOG.graph, "avengers-endgame")
    ids = {node.movie_id for node in chain.nodes}

    assert "avengers-infinity-war" in ids
    assert "iron-man" in ids
    assert "captain-america-the-first-avenger" in ids
    # Nothing that comes after it should be dragged in.
    assert "spider-man-far-from-home" not in ids
    assert "loki" not in ids

    depth = {node.movie_id: node.depth for node in chain.nodes}
    assert depth["avengers-endgame"] == 0
    assert depth["avengers-infinity-war"] == 1
    assert depth["iron-man"] > depth["the-avengers"]


def test_every_chain_is_internally_consistent():
    """Depth must strictly decrease along every drawn edge, for every title."""
    for movie in CATALOG.movies:
        chain = prerequisite_chain(CATALOG.graph, movie.id)
        depth = {node.movie_id: node.depth for node in chain.nodes}
        for edge in chain.edges:
            assert depth[edge.prerequisite_id] > depth[edge.movie_id], (
                f"{movie.id}: edge {edge.prerequisite_id} -> {edge.movie_id} points backwards"
            )


def test_rows_are_ready_for_insert():
    rows = movie_rows(CATALOG)
    assert len(rows) == len(CATALOG.movies)
    assert {row["chrono_order"] for row in rows} == set(range(len(rows)))
    assert {row["release_order"] for row in rows} == set(range(len(rows)))
    for row in rows:
        assert isinstance(row["saga"], str), "enums must be flattened to their values"
