"""Registration, sign-in and the session cookie."""

from __future__ import annotations

from app.core.security import COOKIE_NAME, create_access_token, decode_access_token


def test_register_returns_the_user_and_signs_them_in(api):
    response = api.post(
        "/api/auth/register",
        json={"email": "tony@example.com", "password": "arc-reactor-1"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] == "tony@example.com"
    assert COOKIE_NAME in response.cookies

    # The cookie is enough on its own; no second login round trip.
    assert api.get("/api/auth/me").status_code == 200


def test_register_normalises_the_email(api):
    api.post(
        "/api/auth/register",
        json={"email": "  Steve@Example.COM  ", "password": "shield-1940"},
    )
    api.post("/api/auth/logout")

    # Registered mixed-case, signing in mixed-case differently: both have to
    # land on the same account or the normalisation is only half applied.
    response = api.post(
        "/api/auth/login", json={"email": "STEVE@example.com", "password": "shield-1940"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "steve@example.com"


def test_duplicate_email_is_a_conflict(api):
    payload = {"email": "nat@example.com", "password": "red-room-42"}
    assert api.post("/api/auth/register", json=payload).status_code == 201
    assert api.post("/api/auth/register", json=payload).status_code == 409


def test_short_passwords_are_rejected(api):
    response = api.post(
        "/api/auth/register", json={"email": "clint@example.com", "password": "short"}
    )
    assert response.status_code == 422


def test_login_failures_do_not_distinguish_the_reason(api):
    api.post(
        "/api/auth/register", json={"email": "bruce@example.com", "password": "gamma-ray-77"}
    )

    wrong_password = api.post(
        "/api/auth/login", json={"email": "bruce@example.com", "password": "not-it-at-all"}
    )
    no_such_user = api.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "not-it-at-all"}
    )

    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json()["detail"] == no_such_user.json()["detail"]


def test_me_is_401_when_signed_out(api):
    assert api.get("/api/auth/me").status_code == 401


def test_logout_clears_the_session(api, registered):
    assert api.get("/api/auth/me").status_code == 200
    assert api.post("/api/auth/logout").status_code == 204
    assert api.get("/api/auth/me").status_code == 401


def test_a_garbage_cookie_reads_as_signed_out(api, registered):
    api.cookies.set(COOKIE_NAME, "not-a-jwt")
    assert api.get("/api/auth/me").status_code == 401


def test_a_token_for_a_deleted_user_reads_as_signed_out(api):
    import uuid

    api.cookies.set(COOKIE_NAME, create_access_token(uuid.uuid4()))
    assert api.get("/api/auth/me").status_code == 401


def test_token_round_trips(registered):
    import uuid

    user_id = uuid.UUID(registered["id"])
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_decoding_rubbish_yields_none():
    assert decode_access_token("") is None
    assert decode_access_token("a.b.c") is None
