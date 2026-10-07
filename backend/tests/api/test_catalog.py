"""End-to-end checks against the read-only API and a seeded catalog."""

from __future__ import annotations

from app.core.enums import MCU_UNIVERSES


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #


def test_catalog_returns_every_title(client):
    movies = client.get("/api/movies").json()
    assert len(movies) > 40
    assert {movie["id"] for movie in movies} >= {"iron-man", "avengers-endgame"}


def test_catalog_defaults_to_release_order(client):
    # /api/movies is the whole catalog, Tier B included, so the very first
    # release is Blade (1998) rather than Iron Man -- see
    # test_release_order_starts_with_iron_man for the Marvel Studios-only cut.
    movies = client.get("/api/movies").json()
    assert movies[0]["id"] == "blade"
    dates = [movie["release_date"] for movie in movies]
    assert dates == sorted(dates)


def test_catalog_filters_compose(client):
    movies = client.get("/api/movies", params={"phase": 1, "media_type": "film"}).json()
    assert movies
    assert all(movie["phase"] == 1 and movie["media_type"] == "film" for movie in movies)


def test_catalog_search_is_case_insensitive(client):
    movies = client.get("/api/movies", params={"q": "ENDGAME"}).json()
    assert [movie["id"] for movie in movies] == ["avengers-endgame"]


def test_movie_detail_includes_both_directions(client):
    detail = client.get("/api/movies/the-avengers").json()
    assert detail["title"] == "The Avengers"
    assert detail["synopsis"] is None or isinstance(detail["synopsis"], str)

    prerequisite_ids = {item["id"] for item in detail["prerequisites"]}
    assert {"iron-man-2", "thor", "captain-america-the-first-avenger"} <= prerequisite_ids

    unlocked_ids = {item["id"] for item in detail["unlocks"]}
    assert "captain-america-the-winter-soldier" in unlocked_ids


def test_summaries_carry_a_credit_scene_count_and_detail_carries_the_episodes(client):
    """The card needs a number; only the detail page needs the breakdown.

    A per-episode list on all 128 summaries would be paid for on the catalog
    page, which uses none of it.
    """
    summaries = {movie["id"]: movie for movie in client.get("/api/movies").json()}
    assert summaries["wandavision"]["credit_scenes"] == 4
    assert "credit_scene_episodes" not in summaries["wandavision"]

    detail = client.get("/api/movies/wandavision").json()
    assert detail["credit_scenes"] == 4
    episodes = detail["credit_scene_episodes"]
    assert [episode["episode"] for episode in episodes] == [7, 8, 9]
    assert episodes[-1]["count"] == 2
    assert episodes[0]["name"] == "Breaking the Fourth Wall"


def test_a_recorded_zero_is_not_the_same_as_an_unrecorded_title(client):
    """null and 0 are different answers, and the API keeps them apart."""
    assert client.get("/api/movies/avengers-endgame").json()["credit_scenes"] == 0
    assert client.get("/api/movies/avengers-doomsday").json()["credit_scenes"] is None


def test_unknown_movie_is_404(client):
    assert client.get("/api/movies/not-a-real-film").status_code == 404


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #


def test_release_order_is_sorted_by_date(client):
    payload = client.get("/api/orders/release").json()
    dates = [movie["release_date"] for movie in payload["movies"]]
    assert dates == sorted(dates)
    assert payload["movies"][0]["id"] == "iron-man"


def test_chronological_order_starts_in_the_past(client):
    # include_adjacent defaults to False and filters on universe, so the two
    # Earth-10005 X-Men titles are dropped here even though they sit in that
    # range of the raw catalog order (see test_seed_data.py, unfiltered).
    movies = client.get("/api/orders/chronological").json()["movies"]
    assert [movie["id"] for movie in movies[:6]] == [
        "captain-america-the-first-avenger",
        "agent-carter-one-shot",
        "agent-carter-season-one",
        "agent-carter-season-two",
        "the-fantastic-four-first-steps",
        "captain-marvel",
    ]


def _validate_shipped_order(client, path, **params):
    order = [movie["id"] for movie in client.get(path, params=params).json()["movies"]]
    return client.post("/api/orders/validate", json={"order": order}).json()


def _released_before_its_prerequisite(client):
    """Predicate for an edge that no release order can satisfy.

    Some prerequisites came out after the title that needs them -- Captain
    America: The First Avenger is recommended before The Incredible Hulk, but
    was released three years later. Release order puts them the wrong way round
    by definition, so the validator flagging them is expected, not a hole.
    """
    released = {movie["id"]: movie["release_date"] for movie in client.get("/api/movies").json()}

    def check(violation):
        return (
            violation["kind"] == "out_of_order"
            and released[violation["prerequisite_id"]] > released[violation["movie_id"]]
        )

    return check


def test_the_complete_orders_are_valid_topological_orders(client):
    """With nothing filtered out, chronological order must satisfy the whole DAG.

    Release order must satisfy every edge it can: the only violations allowed
    are edges whose prerequisite was released after the title that needs it.
    """
    result = _validate_shipped_order(client, "/api/orders/chronological", include_adjacent=True)
    assert result["violations"] == []
    assert result["is_valid"]

    unavoidable = _released_before_its_prerequisite(client)
    result = _validate_shipped_order(client, "/api/orders/release", include_adjacent=True)
    assert [violation for violation in result["violations"] if not unavoidable(violation)] == []


def test_the_mcu_only_cut_drops_nothing_but_cross_continuity_prerequisites(client):
    """The default cut filters on universe, and some prerequisites live outside it.

    Deadpool & Wolverine needs Deadpool 2; No Way Home needs the Sony films. Those
    sit outside MCU_UNIVERSES, so an order restricted to MCU continuity cannot
    contain them and the validator is right to say so. A violation pointing at a
    title the cut *does* include would be a real hole in the order, so that is
    what this pins. Release order is also excused the edges it cannot satisfy
    (see _released_before_its_prerequisite).
    """
    universe = {movie["id"]: movie["universe"] for movie in client.get("/api/movies").json()}
    unavoidable = _released_before_its_prerequisite(client)

    for path in ("/api/orders/chronological", "/api/orders/release"):
        result = _validate_shipped_order(client, path)
        assert result["violations"] == [
            violation
            for violation in result["violations"]
            if universe[violation["prerequisite_id"]] not in MCU_UNIVERSES
            or (path == "/api/orders/release" and unavoidable(violation))
        ]


# --------------------------------------------------------------------------- #
# Prerequisite chain
# --------------------------------------------------------------------------- #


def test_endgame_chain_has_the_expected_shape(client):
    chain = client.get("/api/movies/avengers-endgame/prerequisites").json()

    assert chain["movie"]["id"] == "avengers-endgame"
    assert chain["movie"]["depth"] == 0

    by_id = {node["id"]: node for node in chain["nodes"]}
    assert by_id["avengers-infinity-war"]["depth"] == 1
    assert by_id["avengers-infinity-war"]["is_direct"] is True
    assert by_id["iron-man"]["depth"] > by_id["the-avengers"]["depth"]

    # A diamond-heavy graph must still yield one node per title.
    ids = [node["id"] for node in chain["nodes"]]
    assert len(ids) == len(set(ids))

    assert chain["stats"]["total"] == len(ids) - 1
    assert chain["stats"]["essential"] + chain["stats"]["recommended"] == chain["stats"]["total"]


def test_every_drawn_edge_points_towards_the_target(client):
    """A backwards edge means the longest-path depth calculation is wrong."""
    for movie_id in ("avengers-endgame", "thunderbolts", "the-marvels", "deadpool-and-wolverine"):
        chain = client.get(f"/api/movies/{movie_id}/prerequisites").json()
        depth = {node["id"]: node["depth"] for node in chain["nodes"]}
        for edge in chain["edges"]:
            assert depth[edge["from"]] > depth[edge["to"]], f"{movie_id}: {edge}"


def test_watch_order_is_a_valid_topological_order(client):
    chain = client.get("/api/movies/avengers-endgame/prerequisites").json()
    position = {movie_id: index for index, movie_id in enumerate(chain["watch_order"])}
    assert chain["movie"]["id"] not in position
    for edge in chain["edges"]:
        if edge["from"] in position and edge["to"] in position:
            assert position[edge["from"]] < position[edge["to"]]


def test_essential_filter_drops_recommended_titles(client):
    everything = client.get("/api/movies/avengers-endgame/prerequisites").json()
    essential = client.get(
        "/api/movies/avengers-endgame/prerequisites", params={"include": "essential"}
    ).json()

    assert essential["stats"]["recommended"] == 0
    assert essential["stats"]["total"] < everything["stats"]["total"]
    assert {node["id"] for node in essential["nodes"]} <= {
        node["id"] for node in everything["nodes"]
    }


def test_a_standalone_title_has_an_empty_chain(client):
    chain = client.get("/api/movies/moon-knight/prerequisites").json()
    assert chain["stats"]["total"] == 0
    assert chain["watch_order"] == []
    assert [node["id"] for node in chain["nodes"]] == ["moon-knight"]


def test_chain_for_unknown_movie_is_404(client):
    assert client.get("/api/movies/nope/prerequisites").status_code == 404


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #


def test_endgame_before_infinity_war_is_reported(client):
    result = client.post(
        "/api/orders/validate",
        json={"order": ["avengers-endgame", "avengers-infinity-war"]},
    ).json()

    assert result["is_valid"] is False
    out_of_order = [v for v in result["violations"] if v["kind"] == "out_of_order"]
    assert len(out_of_order) == 1
    violation = out_of_order[0]
    assert violation["movie_id"] == "avengers-endgame"
    assert violation["prerequisite_id"] == "avengers-infinity-war"
    assert violation["severity"] == "error"
    assert "Avengers: Endgame" in violation["message"]
    assert "Avengers: Infinity War" in violation["message"]
    assert result["suggested_order"] == ["avengers-infinity-war", "avengers-endgame"]


def test_missing_prerequisites_are_warnings_or_errors_by_strength(client):
    result = client.post("/api/orders/validate", json={"order": ["the-avengers"]}).json()

    kinds = {v["kind"] for v in result["violations"]}
    assert kinds == {"missing_prerequisite"}
    severities = {v["severity"] for v in result["violations"]}
    assert severities == {"error", "warning"}
    assert "iron-man-2" in result["missing_prerequisite_ids"]


def test_unknown_and_duplicate_ids_are_reported_not_rejected(client):
    result = client.post(
        "/api/orders/validate",
        json={"order": ["iron-man", "iron-man", "not-real"]},
    ).json()
    assert result["duplicate_ids"] == ["iron-man"]
    assert result["unknown_ids"] == ["not-real"]
    assert result["checked_count"] == 1


def test_completion_produces_an_order_that_validates_clean(client):
    completed = client.post("/api/orders/complete", json={"order": ["avengers-endgame"]}).json()

    assert completed["order"][-1] == "avengers-endgame"
    assert "avengers-infinity-war" in completed["added_ids"]

    result = client.post("/api/orders/validate", json={"order": completed["order"]}).json()
    assert result["violations"] == []


# --------------------------------------------------------------------------- #
# Edge list
# --------------------------------------------------------------------------- #


def test_edge_list_matches_the_chains(client):
    edges = client.get("/api/graph/edges").json()["edges"]
    assert len(edges) > 50
    pairs = {(edge["from"], edge["to"]) for edge in edges}
    assert ("avengers-infinity-war", "avengers-endgame") in pairs
    assert all(edge["strength"] in {"essential", "recommended"} for edge in edges)


# --------------------------------------------------------------------------- #
# Recommended orders
# --------------------------------------------------------------------------- #


def test_recommended_orders_list_computed_then_curated(client):
    orders = client.get("/api/orders/recommended").json()
    ids = [order["id"] for order in orders]
    assert ids[:2] == ["release", "story"]
    assert {"disney-plus-timeline", "doomsday-express", "road-to-doomsday"} <= set(ids)
    kinds = [order["kind"] for order in orders]
    assert kinds == sorted(kinds)  # "computed" < "curated"


def test_every_recommended_order_names_real_titles_once(client):
    known = {movie["id"] for movie in client.get("/api/movies").json()}
    for order in client.get("/api/orders/recommended").json():
        assert order["movie_ids"], order["id"]
        assert set(order["movie_ids"]) <= known, order["id"]
        assert len(set(order["movie_ids"])) == len(order["movie_ids"]), order["id"]


def test_curated_orders_cite_their_sources(client):
    for order in client.get("/api/orders/recommended").json():
        if order["kind"] == "curated" and order["id"] != "street-level":
            assert order["sources"], order["id"]
            assert all(source["url"].startswith("https://") for source in order["sources"])


def test_orders_built_from_the_graph_never_break_it(client):
    orders = {o["id"]: o for o in client.get("/api/orders/recommended").json()}
    assert orders["story"]["out_of_order"] == 0
    assert orders["road-to-doomsday"]["out_of_order"] == 0
    assert orders["road-to-doomsday"]["skipped_essentials"] == 0
    assert orders["road-to-doomsday"]["movie_ids"][-1] == "avengers-doomsday"


def test_one_recommended_order_by_id(client):
    response = client.get("/api/orders/recommended/doomsday-express")
    assert response.status_code == 200
    assert response.json()["movie_ids"][0] == "avengers-endgame"
    assert client.get("/api/orders/recommended/nope").status_code == 404


def test_a_curated_order_naming_an_unknown_title_fails_loudly():
    import pytest

    from app.catalog import get_catalog
    from app.seed.schema import SeedValidationError
    from app.services.recommended import CuratedOrder, build_recommended

    bad = CuratedOrder(
        id="bad", name="Bad", tagline="x", description="x", movie_ids=["iron-man", "iron-man-4"]
    )
    with pytest.raises(SeedValidationError) as caught:
        build_recommended(get_catalog(), [bad])
    assert any("iron-man-4" in problem for problem in caught.value.problems)
