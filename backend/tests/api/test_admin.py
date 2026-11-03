"""The catalog editor's API: who can reach it, and what a save does.

Runs on the same in-memory SQLite as the account tests. What it cannot show --
that renumbering the release order survives the deferrable unique constraints,
and that deleting a title cascades -- is covered by the Postgres job
(`tests/test_migrations.py`).
"""

from __future__ import annotations

import copy
import json

import pytest

import app.catalog as catalog_module
from app.core.config import get_settings
from app.core.security import (
    ADMIN_COOKIE_NAME,
    COOKIE_NAME,
    create_access_token,
    create_admin_token,
    decode_access_token,
    hash_password,
    is_admin_token,
)
from app.models import AdminAttempt, CatalogHistory, Movie
from app.seed.reader import DEFAULT_SEED_PATH
from app.services import admin_auth, catalog_store

PASSWORD = "correct-horse-battery-staple"


@pytest.fixture
def configured(monkeypatch, request):
    """An editor guarded by PASSWORD, in the `test` environment."""
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", hash_password(PASSWORD))
    get_settings.cache_clear()
    # Runs before monkeypatch restores the environment, so the next settings read
    # sees the restored values rather than this fixture's.
    request.addfinalizer(get_settings.cache_clear)


@pytest.fixture
def admin(api, configured):
    """A client that has signed in to the editor."""
    response = api.post("/api/admin/login", json={"password": PASSWORD})
    assert response.status_code == 200, response.text
    return api


def seed_text() -> str:
    return DEFAULT_SEED_PATH.read_text(encoding="utf-8")


def edited(document: dict, movie_id: str = "iron-man", **fields) -> dict:
    changed = copy.deepcopy(document)
    movie = next(m for m in changed["movies"] if m["id"] == movie_id)
    movie.update(fields)
    return changed


# --------------------------------------------------------------------------- #
# Who can reach it
# --------------------------------------------------------------------------- #
def test_the_editor_does_not_exist_until_a_password_is_configured(api):
    for path in ("/api/admin/session", "/api/admin/catalog", "/api/admin/enums"):
        assert api.get(path).status_code == 404
    assert api.post("/api/admin/login", json={"password": "anything"}).status_code == 404


def test_signed_out_is_an_answer_not_an_error(api, configured):
    response = api.get("/api/admin/session")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "open": False}


def test_every_catalog_route_needs_the_cookie(api, configured):
    for method, path in (
        ("get", "/api/admin/catalog"),
        ("put", "/api/admin/catalog"),
        ("get", "/api/admin/catalog/export"),
        ("get", "/api/admin/catalog/history"),
        ("post", "/api/admin/catalog/restore"),
        ("get", "/api/admin/enums"),
        ("get", "/api/admin/tmdb/search?title=x&media_type=film"),
        ("get", "/api/admin/titles/iron-man/usage"),
    ):
        assert getattr(api, method)(path).status_code == 401, path


def test_a_wrong_password_is_refused_and_a_right_one_signs_in(api, configured):
    wrong = api.post("/api/admin/login", json={"password": "nope"})
    assert wrong.status_code == 401
    assert ADMIN_COOKIE_NAME not in wrong.cookies

    right = api.post("/api/admin/login", json={"password": PASSWORD})
    assert right.status_code == 200
    assert right.json() == {"authenticated": True, "open": False}
    assert ADMIN_COOKIE_NAME in right.cookies
    assert api.get("/api/admin/session").json()["authenticated"] is True
    assert api.get("/api/admin/enums").status_code == 200


def test_signing_out_ends_the_session(admin):
    assert admin.post("/api/admin/logout").status_code == 204
    assert admin.get("/api/admin/catalog").status_code == 401


def test_five_wrong_passwords_lock_the_client_out_even_for_the_right_one(api, configured, db):
    for _ in range(admin_auth.MAX_FAILURES):
        assert api.post("/api/admin/login", json={"password": "nope"}).status_code == 401

    locked = api.post("/api/admin/login", json={"password": PASSWORD})
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0
    assert db.query(AdminAttempt).count() == 1


def test_a_lock_that_has_run_out_starts_the_count_again(db):
    from datetime import UTC, datetime, timedelta

    start = datetime.now(UTC)
    for _ in range(admin_auth.MAX_FAILURES):
        admin_auth.record_failure(db, "k", now=start)
    assert admin_auth.seconds_locked(db, "k", now=start) > 0

    later = start + admin_auth.LOCK_FOR + timedelta(seconds=1)
    assert admin_auth.seconds_locked(db, "k", now=later) == 0
    admin_auth.record_failure(db, "k", now=later)
    assert admin_auth.seconds_locked(db, "k", now=later) == 0, "one typo must not re-lock"


def test_open_in_dev_without_a_password(api, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "dev")
    monkeypatch.setattr(catalog_module, "_database_enabled", lambda: False)
    get_settings.cache_clear()
    try:
        assert api.get("/api/admin/session").json() == {"authenticated": True, "open": True}
        assert api.get("/api/admin/enums").status_code == 200
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_a_user_session_is_not_an_admin_session(api, configured, registered):
    assert api.get("/api/admin/catalog").status_code == 401
    assert api.get("/api/admin/session").json()["authenticated"] is False


def test_the_two_token_kinds_do_not_decode_as_each_other(registered):
    admin_token = create_admin_token()
    assert is_admin_token(admin_token)
    assert decode_access_token(admin_token) is None

    import uuid

    assert not is_admin_token(create_access_token(uuid.uuid4()))


def test_an_admin_token_in_the_user_cookie_is_not_a_login(api):
    api.cookies.set(COOKIE_NAME, create_admin_token())
    assert api.get("/api/auth/me").status_code == 401


# --------------------------------------------------------------------------- #
# Reading and saving
# --------------------------------------------------------------------------- #
def test_the_first_read_imports_the_bundled_file(admin):
    state = admin.get("/api/admin/catalog").json()
    assert state["revision"] == catalog_store.revision_of(seed_text())
    assert state["document"] == json.loads(seed_text())
    assert state["problems"] == []
    assert state["counts"]["titles"] == len(state["document"]["movies"])
    assert state["counts"]["edges"] > 0


def test_an_edit_is_stored_synced_and_kept_in_history(admin, db):
    state = admin.get("/api/admin/catalog").json()
    document = edited(state["document"], synopsis="Rewritten by the editor.")

    saved = admin.put(
        "/api/admin/catalog", json={"document": document, "revision": state["revision"]}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] != state["revision"]
    assert saved.json()["document"] == document

    # `movies` is what orders and progress point at; it moves with the document.
    db.expire_all()
    assert db.get(Movie, "iron-man").synopsis == "Rewritten by the editor."

    history = admin.get("/api/admin/catalog/history").json()
    assert [entry["revision"] for entry in history] == [state["revision"]]
    assert db.query(CatalogHistory).count() == 1

    exported = admin.get("/api/admin/catalog/export")
    assert json.loads(exported.text) == document
    assert exported.text == catalog_store.serialise(document)


def test_saving_nothing_changes_nothing(admin, db):
    state = admin.get("/api/admin/catalog").json()
    saved = admin.put(
        "/api/admin/catalog", json={"document": state["document"], "revision": state["revision"]}
    )
    assert saved.status_code == 200
    assert saved.json()["revision"] == state["revision"]
    assert db.query(CatalogHistory).count() == 0


def test_a_stale_revision_is_refused_and_nothing_is_written(admin):
    state = admin.get("/api/admin/catalog").json()
    first = edited(state["document"], synopsis="First tab.")
    assert (
        admin.put(
            "/api/admin/catalog", json={"document": first, "revision": state["revision"]}
        ).status_code
        == 200
    )

    second = edited(state["document"], synopsis="Second tab, still on the old revision.")
    stale = admin.put(
        "/api/admin/catalog", json={"document": second, "revision": state["revision"]}
    )
    assert stale.status_code == 409
    assert "Reload" in stale.json()["detail"]
    assert admin.get("/api/admin/catalog").json()["document"] == first


def test_an_invalid_document_is_refused_with_its_reasons(admin):
    state = admin.get("/api/admin/catalog").json()
    broken = copy.deepcopy(state["document"])
    broken["movies"][5]["prerequisites"] = [{"id": "no-such-title", "strength": "essential"}]

    refused = admin.put(
        "/api/admin/catalog", json={"document": broken, "revision": state["revision"]}
    )
    assert refused.status_code == 422
    assert any("no-such-title" in problem for problem in refused.json()["detail"]["problems"])

    after = admin.get("/api/admin/catalog").json()
    assert after["revision"] == state["revision"]
    assert after["document"] == state["document"]


def test_a_title_a_curated_order_names_cannot_be_deleted(admin):
    """Otherwise the save succeeds and /api/orders/recommended becomes a 500."""
    from app.services.recommended import read_curated

    named = read_curated()[0].movie_ids[0]
    state = admin.get("/api/admin/catalog").json()
    document = copy.deepcopy(state["document"])
    document["movies"] = [m for m in document["movies"] if m["id"] != named]
    for movie in document["movies"]:
        movie["prerequisites"] = [e for e in movie.get("prerequisites", []) if e["id"] != named]

    refused = admin.put(
        "/api/admin/catalog", json={"document": document, "revision": state["revision"]}
    )
    assert refused.status_code == 422
    assert any(named in problem for problem in refused.json()["detail"]["problems"])


def test_restoring_an_earlier_version_is_itself_a_save(admin):
    state = admin.get("/api/admin/catalog").json()
    changed = edited(state["document"], synopsis="Temporary.")
    saved = admin.put(
        "/api/admin/catalog", json={"document": changed, "revision": state["revision"]}
    ).json()

    history = admin.get("/api/admin/catalog/history").json()
    restored = admin.post(
        "/api/admin/catalog/restore",
        json={"history_id": history[0]["id"], "revision": saved["revision"]},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["document"] == state["document"]
    assert restored.json()["revision"] == state["revision"]
    # The version it replaced is now in history too, so the restore can be undone.
    assert len(admin.get("/api/admin/catalog/history").json()) == 2


def test_usage_counts_what_deleting_a_title_would_destroy(admin):
    assert admin.get("/api/admin/titles/iron-man/usage").json() == {
        "watch_progress": 0,
        "order_items": 0,
    }


# --------------------------------------------------------------------------- #
# The public site follows the stored document
# --------------------------------------------------------------------------- #
def test_the_public_api_serves_what_the_editor_saved(admin, db, monkeypatch):
    monkeypatch.setattr(catalog_module, "_database_enabled", lambda: True)
    monkeypatch.setattr(catalog_module, "SessionLocal", lambda: db)
    monkeypatch.setattr(catalog_module, "_snapshot", None)

    # Nothing stored yet: the bundled file is the catalog.
    before = admin.get("/api/movies/iron-man").json()["synopsis"]

    state = admin.get("/api/admin/catalog").json()
    document = edited(state["document"], synopsis="Live without a deploy.")
    admin.put("/api/admin/catalog", json={"document": document, "revision": state["revision"]})

    assert admin.get("/api/movies/iron-man").json()["synopsis"] == "Live without a deploy."
    assert before != "Live without a deploy."


def test_an_unreachable_database_falls_back_to_the_bundled_catalog(api, monkeypatch):
    def unreachable():
        raise OSError("connection refused")

    monkeypatch.setattr(catalog_module, "_database_enabled", lambda: True)
    monkeypatch.setattr(catalog_module, "SessionLocal", unreachable)
    monkeypatch.setattr(catalog_module, "_snapshot", None)

    response = api.get("/api/movies/iron-man")
    assert response.status_code == 200
    assert response.json()["id"] == "iron-man"


def test_recommended_orders_follow_the_catalog_they_were_built_from(admin, db, monkeypatch):
    monkeypatch.setattr(catalog_module, "_database_enabled", lambda: True)
    monkeypatch.setattr(catalog_module, "SessionLocal", lambda: db)
    monkeypatch.setattr(catalog_module, "_snapshot", None)

    first = admin.get("/api/orders/recommended").json()
    state = admin.get("/api/admin/catalog").json()
    admin.put(
        "/api/admin/catalog",
        json={
            "document": edited(state["document"], runtime_min=999),
            "revision": state["revision"],
        },
    )
    second = admin.get("/api/orders/recommended").json()
    assert [o["id"] for o in first] == [o["id"] for o in second]
    assert first != second, "a runtime edit must reach the totals"


# --------------------------------------------------------------------------- #
# Episodes
# --------------------------------------------------------------------------- #
EPISODES = [
    {"season": 1, "episode": 1, "name": "Pilot", "runtime_min": 40, "air_date": "2028-01-05"},
    {"season": 1, "episode": 2, "name": "Second", "runtime_min": 38, "air_date": None},
]


def with_new_series(document: dict, **extra) -> dict:
    """A copy with a series added at the end -- last in both orders, so nothing renumbers."""
    changed = copy.deepcopy(document)
    series = copy.deepcopy(next(m for m in changed["movies"] if m["id"] == "wonder-man"))
    series.update(
        id="test-series",
        title="Test Series",
        release_date="2028-01-01",
        tmdb_id=None,
        credit_scenes=None,
        prerequisites=[{"id": "wandavision", "strength": "essential"}],
    )
    changed["movies"].append(series)
    changed.update(extra)
    return changed


def test_episodes_saved_in_the_document_are_counted(admin):
    state = admin.get("/api/admin/catalog").json()
    document = with_new_series(state["document"], episodes={"test-series": EPISODES})

    saved = admin.put(
        "/api/admin/catalog", json={"document": document, "revision": state["revision"]}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["episode_counts"]["test-series"] == 2
    # The file's own lists are still there beside it.
    assert len(saved.json()["episode_counts"]) > 1


def test_episodes_for_a_film_are_refused(admin):
    state = admin.get("/api/admin/catalog").json()
    document = copy.deepcopy(state["document"])
    document["episodes"] = {"iron-man": EPISODES}

    refused = admin.put(
        "/api/admin/catalog", json={"document": document, "revision": state["revision"]}
    )
    assert refused.status_code == 422
    assert any("iron-man" in problem for problem in refused.json()["detail"]["problems"])


def test_fetching_episodes_returns_rows_and_writes_nothing(admin, monkeypatch):
    import app.api.routes.admin as admin_routes

    seen = {}

    def fake(session, key, movie, show_ids):
        seen["id"] = movie["id"]
        return EPISODES

    monkeypatch.setattr(admin_routes, "_tmdb_key", lambda: "key")
    monkeypatch.setattr(admin_routes.tmdb, "episode_rows_for", fake)
    before = admin.get("/api/admin/catalog").json()["revision"]

    response = admin.post("/api/admin/titles/wonder-man/episodes/fetch")
    assert response.status_code == 200, response.text
    assert response.json() == {"episodes": EPISODES, "runtime_min": 78}
    assert seen["id"] == "wonder-man"
    assert admin.get("/api/admin/catalog").json()["revision"] == before


def test_fetching_episodes_for_a_film_or_a_stranger_is_refused(admin, monkeypatch):
    import app.api.routes.admin as admin_routes

    monkeypatch.setattr(admin_routes, "_tmdb_key", lambda: "key")
    assert admin.post("/api/admin/titles/iron-man/episodes/fetch").status_code == 422
    assert admin.post("/api/admin/titles/no-such-title/episodes/fetch").status_code == 404


def test_a_tmdb_failure_is_reported_as_a_sentence(admin, monkeypatch):
    import app.api.routes.admin as admin_routes
    from app.services.tmdb import TmdbError

    def fail(*args, **kwargs):
        raise TmdbError("TMDb lists no episodes")

    monkeypatch.setattr(admin_routes, "_tmdb_key", lambda: "key")
    monkeypatch.setattr(admin_routes.tmdb, "episode_rows_for", fail)

    response = admin.post("/api/admin/titles/wonder-man/episodes/fetch")
    assert response.status_code == 502
    assert "TMDb lists no episodes" in response.json()["detail"]


def test_fetching_needs_the_admin_cookie(api, configured):
    assert api.post("/api/admin/titles/wonder-man/episodes/fetch").status_code == 401
