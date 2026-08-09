"""End-to-end checks against the read-only API and a seeded catalog."""

from __future__ import annotations


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
    movies = client.get("/api/movies").json()
    assert movies[0]["id"] == "iron-man"
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
    movies = client.get("/api/orders/chronological").json()["movies"]
    assert [movie["id"] for movie in movies[:5]] == [
        "captain-america-the-first-avenger",
        "agent-carter-one-shot",
        "agent-carter-season-one",
        "agent-carter-season-two",
        "captain-marvel",
    ]


def test_chronological_order_respects_every_prerequisite(client):
    """The order the app ships must itself be a valid topological order."""
    order = [movie["id"] for movie in client.get("/api/orders/chronological").json()["movies"]]
    result = client.post("/api/orders/validate", json={"order": order}).json()
    assert result["violations"] == []
    assert result["is_valid"]


def test_release_order_is_also_internally_consistent(client):
    order = [movie["id"] for movie in client.get("/api/orders/release").json()["movies"]]
    result = client.post("/api/orders/validate", json={"order": order}).json()
    assert [v for v in result["violations"] if v["severity"] == "error"] == []


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
