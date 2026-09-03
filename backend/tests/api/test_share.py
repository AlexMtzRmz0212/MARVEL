"""Share links: minting, revoking, and exactly what a link discloses."""

from __future__ import annotations

import uuid

from app.models.watch_progress import WatchProgress

CHAIN = ["iron-man", "the-incredible-hulk", "iron-man-2"]


def _mint(api) -> str:
    response = api.post("/api/me/share")
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    assert token
    return token


# --------------------------------------------------------------------------- #
# Owning a link
# --------------------------------------------------------------------------- #


def test_sharing_is_off_until_asked_for(api, registered):
    assert api.get("/api/me/share").json() == {"token": None}


def test_minting_a_link_makes_it_readable_back(api, registered):
    token = _mint(api)
    assert api.get("/api/me/share").json() == {"token": token}


def test_rotating_retires_the_previous_link(api, registered):
    first = _mint(api)
    second = _mint(api)

    assert second != first
    assert api.get(f"/api/share/{first}").status_code == 404
    assert api.get(f"/api/share/{second}").status_code == 200


def test_revoking_stops_the_link_resolving(api, registered):
    token = _mint(api)

    assert api.delete("/api/me/share").status_code == 204
    assert api.get("/api/me/share").json() == {"token": None}
    assert api.get(f"/api/share/{token}").status_code == 404


def test_share_routes_need_a_session(api):
    assert api.get("/api/me/share").status_code == 401
    assert api.post("/api/me/share").status_code == 401
    assert api.delete("/api/me/share").status_code == 401


# --------------------------------------------------------------------------- #
# Following a link
# --------------------------------------------------------------------------- #


def test_an_unknown_token_is_a_404_not_a_403(api):
    """A 403 would confirm to somebody guessing that the token exists."""
    response = api.get("/api/share/not-a-real-token")
    assert response.status_code == 404


def test_a_link_carries_the_watched_titles_and_the_display_name(api, registered):
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})
    token = _mint(api)

    body = api.get(f"/api/share/{token}").json()

    assert body["display_name"] == "Peter"
    assert sorted(body["watched_ids"]) == sorted(CHAIN)


def test_a_link_discloses_nothing_beyond_that(api, db, registered):
    """The test that matters: assert on the keys, not just the happy path."""
    api.put(
        "/api/me/watch-progress/iron-man",
        json={"watched_at": "2026-01-01T00:00:00Z", "rating": 9, "notes": "private"},
    )
    token = _mint(api)

    response = api.get(f"/api/share/{token}")
    body = response.json()

    assert set(body) == {"display_name", "watched_ids"}
    assert "private" not in response.text
    assert "example.com" not in response.text.lower()
    assert response.headers["X-Robots-Tag"] == "noindex"


def test_tracked_but_unwatched_titles_are_left_out(api, db, registered):
    """A null watched_at means "on the list", not "seen"."""
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": ["iron-man"]})
    db.add(WatchProgress(user_id=uuid.UUID(registered["id"]), movie_id="thor", watched_at=None))
    db.commit()
    token = _mint(api)

    assert api.get(f"/api/share/{token}").json()["watched_ids"] == ["iron-man"]


def test_a_link_from_an_account_with_nothing_watched_still_resolves(api, registered):
    token = _mint(api)

    body = api.get(f"/api/share/{token}").json()
    assert body["watched_ids"] == []
