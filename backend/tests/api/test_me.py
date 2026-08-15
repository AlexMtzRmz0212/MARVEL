"""Saved orders, watch progress, preferences and the first-login merge."""

from __future__ import annotations

import uuid

CHAIN = ["iron-man", "the-incredible-hulk", "iron-man-2"]


def _create(api, name="Phase One", movie_ids=None):
    response = api.post(
        "/api/me/orders", json={"name": name, "movie_ids": movie_ids or CHAIN}
    )
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Authentication is required
# --------------------------------------------------------------------------- #


def test_every_me_route_needs_a_session(api):
    assert api.get("/api/me/orders").status_code == 401
    assert api.get("/api/me/watch-progress").status_code == 401
    assert api.post("/api/me/import", json={}).status_code == 401


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #


def test_create_and_list_orders(api, registered):
    created = _create(api)
    assert created["movie_ids"] == CHAIN

    listed = api.get("/api/me/orders").json()
    assert [order["id"] for order in listed] == [created["id"]]


def test_a_client_supplied_id_is_honoured(api, registered):
    wanted = str(uuid.uuid4())
    response = api.post(
        "/api/me/orders", json={"id": wanted, "name": "Mine", "movie_ids": CHAIN}
    )
    assert response.json()["id"] == wanted


def test_unknown_title_ids_are_rejected_by_name(api, registered):
    response = api.post(
        "/api/me/orders", json={"name": "Bad", "movie_ids": ["iron-man", "howard-the-duck"]}
    )
    assert response.status_code == 422
    assert "howard-the-duck" in response.json()["detail"]


def test_duplicate_titles_collapse(api, registered):
    created = _create(api, movie_ids=["iron-man", "iron-man", "iron-man-2"])
    assert created["movie_ids"] == ["iron-man", "iron-man-2"]


def test_duplicate_names_conflict(api, registered):
    _create(api, name="Phase One")
    response = api.post("/api/me/orders", json={"name": "Phase One", "movie_ids": []})
    assert response.status_code == 409


def test_reordering_renumbers_contiguously(api, registered, db):
    from app.models.custom_order import CustomOrderItem

    created = _create(api)
    reversed_chain = list(reversed(CHAIN))

    response = api.put(
        f"/api/me/orders/{created['id']}",
        json={"name": "Phase One", "movie_ids": reversed_chain},
    )
    assert response.status_code == 200
    assert response.json()["movie_ids"] == reversed_chain

    # The interesting part is the stored positions, not the response: a naive
    # in-place renumber trips the (order_id, position) unique constraint, and a
    # sloppy one leaves gaps.
    rows = (
        db.query(CustomOrderItem)
        .filter(CustomOrderItem.order_id == uuid.UUID(created["id"]))
        .order_by(CustomOrderItem.position)
        .all()
    )
    assert [row.position for row in rows] == [0, 1, 2]
    assert [row.movie_id for row in rows] == reversed_chain


def test_shrinking_an_order_drops_the_removed_items(api, registered):
    created = _create(api)
    response = api.put(
        f"/api/me/orders/{created['id']}", json={"name": "Phase One", "movie_ids": ["iron-man"]}
    )
    assert response.json()["movie_ids"] == ["iron-man"]


def test_deleting_an_order_takes_its_items(api, registered, db):
    from app.models.custom_order import CustomOrderItem

    created = _create(api)
    assert api.delete(f"/api/me/orders/{created['id']}").status_code == 204
    assert api.get(f"/api/me/orders/{created['id']}").status_code == 404
    assert db.query(CustomOrderItem).count() == 0


def test_another_users_order_is_a_404_not_a_403(api, registered):
    created = _create(api)

    api.post("/api/auth/logout")
    api.post(
        "/api/auth/register", json={"email": "thanos@example.com", "password": "balanced-50"}
    )

    # 403 would confirm the id exists, which is more than a stranger should get.
    assert api.get(f"/api/me/orders/{created['id']}").status_code == 404
    assert api.put(
        f"/api/me/orders/{created['id']}", json={"name": "Stolen", "movie_ids": []}
    ).status_code == 404
    assert api.delete(f"/api/me/orders/{created['id']}").status_code == 404


# --------------------------------------------------------------------------- #
# Watch progress
# --------------------------------------------------------------------------- #


def test_watch_progress_round_trips_as_a_map(api, registered):
    assert api.get("/api/me/watch-progress").json() == {}

    api.put("/api/me/watch-progress/iron-man", json={"watched_at": "2026-01-01T00:00:00Z"})
    progress = api.get("/api/me/watch-progress").json()
    assert set(progress) == {"iron-man"}
    assert progress["iron-man"]["watched_at"].startswith("2026-01-01")


def test_setting_a_rating_keeps_the_timestamp(api, registered):
    api.put(
        "/api/me/watch-progress/iron-man",
        json={"watched_at": "2026-01-01T00:00:00Z", "rating": 9},
    )
    assert api.get("/api/me/watch-progress").json()["iron-man"]["rating"] == 9


def test_ratings_outside_one_to_ten_are_rejected(api, registered):
    response = api.put("/api/me/watch-progress/iron-man", json={"rating": 11})
    assert response.status_code == 422


def test_unwatching_removes_the_row(api, registered):
    api.put("/api/me/watch-progress/iron-man", json={"watched_at": "2026-01-01T00:00:00Z"})
    assert api.delete("/api/me/watch-progress/iron-man").status_code == 204
    # Removed entirely rather than left with a null timestamp, matching what
    # watchStorage.toggleWatched does locally.
    assert api.get("/api/me/watch-progress").json() == {}


def test_bulk_marks_a_chain_without_rewriting_existing_timestamps(api, registered):
    api.put("/api/me/watch-progress/iron-man", json={"watched_at": "2020-05-05T00:00:00Z"})

    response = api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})
    assert response.status_code == 200

    progress = response.json()
    assert set(progress) == set(CHAIN)
    assert progress["iron-man"]["watched_at"].startswith("2020-05-05")


def test_reset_clears_everything(api, registered):
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})
    assert api.delete("/api/me/watch-progress").status_code == 204
    assert api.get("/api/me/watch-progress").json() == {}


def test_watch_progress_is_per_user(api, registered):
    api.put("/api/me/watch-progress/iron-man", json={"watched_at": "2026-01-01T00:00:00Z"})

    api.post("/api/auth/logout")
    api.post("/api/auth/register", json={"email": "wanda@example.com", "password": "scarlet-77"})

    assert api.get("/api/me/watch-progress").json() == {}


# --------------------------------------------------------------------------- #
# Preferences
# --------------------------------------------------------------------------- #


def test_preferences_start_empty_and_merge(api, registered):
    assert registered["preferences"] == {}

    response = api.patch("/api/me/preferences", json={"watched_display_mode": "hide"})
    assert response.json()["preferences"] == {"watched_display_mode": "hide"}

    # An empty patch must not wipe what is already stored.
    assert api.patch("/api/me/preferences", json={}).json()["preferences"] == {
        "watched_display_mode": "hide"
    }
    assert api.get("/api/auth/me").json()["preferences"] == {"watched_display_mode": "hide"}


def test_unknown_preference_values_are_rejected(api, registered):
    assert api.patch(
        "/api/me/preferences", json={"watched_display_mode": "explode"}
    ).status_code == 422


# --------------------------------------------------------------------------- #
# First-login merge
# --------------------------------------------------------------------------- #


def test_import_brings_orders_progress_and_preferences_across(api, registered):
    response = api.post(
        "/api/me/import",
        json={
            "orders": [{"id": str(uuid.uuid4()), "name": "From my laptop", "movie_ids": CHAIN}],
            "watch_progress": {"iron-man": {"watched_at": "2026-01-01T00:00:00Z"}},
            "preferences": {"watched_display_mode": "hide"},
        },
    )
    assert response.status_code == 200

    result = response.json()
    assert result["orders_imported"] == 1
    assert result["watch_progress_imported"] == 1

    assert len(api.get("/api/me/orders").json()) == 1
    assert set(api.get("/api/me/watch-progress").json()) == {"iron-man"}
    assert api.get("/api/auth/me").json()["preferences"] == {"watched_display_mode": "hide"}


def test_importing_twice_is_idempotent(api, registered):
    payload = {
        "orders": [{"id": str(uuid.uuid4()), "name": "Once", "movie_ids": CHAIN}],
        "watch_progress": {"iron-man": {"watched_at": "2026-01-01T00:00:00Z"}},
    }

    first = api.post("/api/me/import", json=payload).json()
    second = api.post("/api/me/import", json=payload).json()

    # StrictMode double-invokes effects, so a repeated submit has to be a no-op
    # rather than a second copy of everything.
    assert first["orders_imported"] == 1
    assert second["orders_imported"] == 0
    assert second["orders_skipped"] == 1
    assert len(api.get("/api/me/orders").json()) == 1


def test_import_renames_rather_than_failing_on_a_name_clash(api, registered):
    _create(api, name="Phase One")

    result = api.post(
        "/api/me/import",
        json={"orders": [{"id": str(uuid.uuid4()), "name": "Phase One", "movie_ids": CHAIN}]},
    ).json()

    assert result["orders_imported"] == 1
    assert result["orders_renamed"] == ["Phase One (2)"]
    assert {order["name"] for order in api.get("/api/me/orders").json()} == {
        "Phase One",
        "Phase One (2)",
    }


def test_import_never_clobbers_existing_progress(api, registered):
    api.put("/api/me/watch-progress/iron-man", json={"watched_at": "2020-05-05T00:00:00Z"})

    result = api.post(
        "/api/me/import",
        json={"watch_progress": {"iron-man": {"watched_at": "2026-01-01T00:00:00Z"}}},
    ).json()

    # Signing in on a second device must not overwrite the account with
    # whatever that device happened to know.
    assert result["watch_progress_imported"] == 0
    assert api.get("/api/me/watch-progress").json()["iron-man"]["watched_at"].startswith("2020")


def test_import_drops_unknown_titles_instead_of_failing(api, registered):
    result = api.post(
        "/api/me/import",
        json={
            "orders": [
                {
                    "id": str(uuid.uuid4()),
                    "name": "Stale",
                    "movie_ids": ["iron-man", "retired-title"],
                }
            ],
            "watch_progress": {"also-retired": {"watched_at": "2026-01-01T00:00:00Z"}},
        },
    ).json()

    assert result["orders_imported"] == 1
    assert set(result["unknown_movie_ids"]) == {"retired-title", "also-retired"}
    assert api.get("/api/me/orders").json()[0]["movie_ids"] == ["iron-man"]


def test_import_reassigns_an_id_owned_by_someone_else(api, registered):
    stolen = _create(api)["id"]

    api.post("/api/auth/logout")
    api.post("/api/auth/register", json={"email": "loki@example.com", "password": "mischief-9"})

    result = api.post(
        "/api/me/import",
        json={"orders": [{"id": stolen, "name": "Not yours", "movie_ids": CHAIN}]},
    ).json()

    assert result["orders_imported"] == 1
    assert api.get("/api/me/orders").json()[0]["id"] != stolen
