"""Friend codes, the request handshake, and what a friendship discloses.

Three things here are easy to get quietly wrong and are pinned accordingly.

The first is the canonical pair. `friendships` stores one row per relationship
with the smaller uuid in `user_a_id`, so a bug in the ordering does not produce
an error -- it produces two rows, and each person sees a request the other has
no idea they sent. `test_a_friendship_is_stored_once_whichever_way_round` is
what catches that.

The second is consent. Accepting is the only thing that discloses anything, so
the test that the *sender* cannot accept their own request is the test that the
feature has a handshake at all rather than a delay.

The third is the disclosure itself, which is asserted on the set of keys rather
than the happy path, exactly as `test_share` does: a field added to the ORM
later must not be able to appear here without a test going red.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models.friendship import Friendship

PASSWORD = "web-slinger-1"
PETER = "peter@example.com"
MJ = "mj@example.com"
NED = "ned@example.com"

CHAIN = ["iron-man", "the-incredible-hulk", "iron-man-2"]


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def _register(api, email: str, display_name: str) -> dict:
    """Register, which also signs the client in as the new account."""
    response = api.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _sign_in(api, email: str) -> None:
    """Swap which account the single cookie jar is holding."""
    response = api.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text


def _code(api) -> str:
    response = api.get("/api/me/friends/code")
    assert response.status_code == 200, response.text
    return response.json()["code"]


def _ask(api, code: str):
    return api.post("/api/me/friends/requests", json={"code": code})


@pytest.fixture
def mj(api, registered):
    """A second account, leaving the client signed back in as Peter."""
    other = _register(api, MJ, "MJ")
    _sign_in(api, PETER)
    return other


@pytest.fixture
def friends(api, registered, mj):
    """Peter and MJ, already friends. Client ends signed in as Peter."""
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    assert _ask(api, mj_code).status_code == 201

    _sign_in(api, MJ)
    assert api.post(f"/api/me/friends/requests/{registered['id']}/accept").status_code == 204

    _sign_in(api, PETER)
    return registered, mj


# --------------------------------------------------------------------------- #
# the code
# --------------------------------------------------------------------------- #


def test_an_account_has_a_code_from_the_moment_it_exists(api, registered):
    """No opt-in step, unlike a share link -- a code discloses nothing."""
    code = _code(api)
    assert len(code) == 10
    assert code == _code(api)


def test_the_code_avoids_the_letters_that_read_as_digits(api, registered):
    assert not set(_code(api)) & set("ILOU")


def test_rotating_retires_the_previous_code(api, registered, mj):
    first = _code(api)
    second = api.post("/api/me/friends/code").json()["code"]
    assert second != first

    _sign_in(api, MJ)
    assert _ask(api, first).status_code == 404
    assert _ask(api, second).status_code == 201


def test_rotating_leaves_existing_friendships_alone(api, friends):
    """Friendships are rows in their own right; nothing refers back to the code."""
    api.post("/api/me/friends/code")

    assert len(api.get("/api/me/friends").json()) == 1


def test_a_code_is_read_forgivingly(api, registered, mj):
    """People paste the display hyphen, lower case, and a stray space with it."""
    code = _code(api)
    typed = f" {code[:5].lower()}-{code[5:].lower()} "

    _sign_in(api, MJ)
    assert _ask(api, typed).status_code == 201


def test_letters_mistaken_for_digits_still_resolve(api, registered, mj):
    """The alphabet has no I, L or O, so anyone writing one meant 1, 1 and 0."""
    code = _code(api)
    mistyped = code.replace("1", "I").replace("0", "O")

    _sign_in(api, MJ)
    assert _ask(api, mistyped).status_code == 201


def test_garbage_is_an_unknown_code_rather_than_a_validation_error(api, registered):
    """One failure message, not two: unparseable and unknown are the same dead end."""
    assert _ask(api, "!!!!").status_code == 404


# --------------------------------------------------------------------------- #
# asking
# --------------------------------------------------------------------------- #


def test_your_own_code_is_refused(api, registered):
    response = _ask(api, _code(api))
    assert response.status_code == 400
    assert "own" in response.json()["detail"]


def test_an_unknown_code_is_a_404_not_a_403(api, registered):
    """A 403 would confirm to somebody guessing that the code exists."""
    assert _ask(api, "ZZZZZZZZZZ").status_code == 404


def test_a_request_is_incoming_for_them_and_outgoing_for_you(api, registered, mj):
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    body = _ask(api, mj_code).json()
    assert body == {"status": "pending", "user_id": mj["id"], "display_name": "MJ"}

    mine = api.get("/api/me/friends/requests").json()
    assert [row["display_name"] for row in mine["outgoing"]] == ["MJ"]
    assert mine["incoming"] == []

    _sign_in(api, MJ)
    theirs = api.get("/api/me/friends/requests").json()
    assert [row["display_name"] for row in theirs["incoming"]] == ["Peter"]
    assert theirs["outgoing"] == []


def test_asking_twice_is_a_conflict(api, registered, mj):
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    assert _ask(api, mj_code).status_code == 201
    assert _ask(api, mj_code).status_code == 409


def test_asking_somebody_already_a_friend_is_a_conflict(api, friends):
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    response = _ask(api, mj_code)
    assert response.status_code == 409
    assert "already friends" in response.json()["detail"]


def test_crossed_requests_become_a_friendship(api, registered, mj):
    """Two people who each went and found the other's code have consented.

    Answering "you already have a request from them, go and find it" would be
    the app being obtuse about something it can see perfectly well.
    """
    peter_code = _code(api)
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    assert _ask(api, mj_code).status_code == 201

    _sign_in(api, MJ)
    body = _ask(api, peter_code).json()
    assert body["status"] == "accepted"

    assert len(api.get("/api/me/friends").json()) == 1
    assert api.get("/api/me/friends/requests").json() == {"incoming": [], "outgoing": []}


def test_a_friendship_is_stored_once_whichever_way_round(api, db, registered, mj):
    """The bug this catches is two rows, not an error.

    Without the canonical ordering, (Peter, MJ) and (MJ, Peter) are different
    primary keys, and each person ends up holding a request the other cannot see.
    """
    _sign_in(api, MJ)
    mj_code = _code(api)
    _sign_in(api, PETER)
    _ask(api, mj_code)

    rows = db.scalars(select(Friendship)).all()
    assert len(rows) == 1
    assert rows[0].user_a_id < rows[0].user_b_id


# --------------------------------------------------------------------------- #
# answering
# --------------------------------------------------------------------------- #


def test_accepting_puts_each_on_the_others_list(api, friends):
    peter, mj_user = friends

    mine = api.get("/api/me/friends").json()
    assert [row["display_name"] for row in mine] == ["MJ"]
    assert mine[0]["user_id"] == mj_user["id"]
    assert mine[0]["friends_since"] is not None

    _sign_in(api, MJ)
    assert [row["user_id"] for row in api.get("/api/me/friends").json()] == [peter["id"]]


def test_the_sender_cannot_accept_their_own_request(api, registered, mj):
    """The test that this is a handshake rather than a delay."""
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    _ask(api, mj_code)

    assert api.post(f"/api/me/friends/requests/{mj['id']}/accept").status_code == 404
    assert api.get("/api/me/friends").json() == []


def test_accepting_a_request_that_does_not_exist_is_a_404(api, registered, mj):
    assert api.post(f"/api/me/friends/requests/{mj['id']}/accept").status_code == 404


def test_declining_removes_it_for_both_and_leaves_them_free_to_ask_again(api, registered, mj):
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    _ask(api, mj_code)

    _sign_in(api, MJ)
    assert api.delete(f"/api/me/friends/requests/{registered['id']}").status_code == 204
    assert api.get("/api/me/friends/requests").json()["incoming"] == []

    _sign_in(api, PETER)
    assert api.get("/api/me/friends/requests").json()["outgoing"] == []
    # Nothing was retained, so the door is not locked behind them.
    assert _ask(api, mj_code).status_code == 201


def test_cancelling_your_own_request_withdraws_it(api, registered, mj):
    _sign_in(api, MJ)
    mj_code = _code(api)

    _sign_in(api, PETER)
    _ask(api, mj_code)
    assert api.delete(f"/api/me/friends/requests/{mj['id']}").status_code == 204

    _sign_in(api, MJ)
    assert api.get("/api/me/friends/requests").json()["incoming"] == []


def test_unfriending_ends_it_for_both_at_once(api, friends):
    peter, mj_user = friends

    assert api.delete(f"/api/me/friends/{mj_user['id']}").status_code == 204
    assert api.get("/api/me/friends").json() == []

    _sign_in(api, MJ)
    assert api.get("/api/me/friends").json() == []


def test_unfriending_a_stranger_is_a_404(api, registered, mj):
    assert api.delete(f"/api/me/friends/{mj['id']}").status_code == 404


# --------------------------------------------------------------------------- #
# what a friendship discloses
# --------------------------------------------------------------------------- #


def test_a_friend_sees_the_watched_titles_and_the_display_name(api, friends):
    _sign_in(api, MJ)
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})

    _sign_in(api, PETER)
    body = api.get("/api/me/friends/progress").json()

    assert len(body) == 1
    assert body[0]["display_name"] == "MJ"
    assert sorted(body[0]["watched_ids"]) == sorted(CHAIN)


def test_a_friendship_discloses_nothing_beyond_that(api, friends):
    """Asserted on the keys, so a new ORM column cannot slip through."""
    _sign_in(api, MJ)
    api.put(
        "/api/me/watch-progress/iron-man",
        json={"watched_at": "2026-01-01T00:00:00Z", "rating": 9, "notes": "private"},
    )
    api.post("/api/me/orders", json={"name": "MJ's order", "movie_ids": ["iron-man"]})

    _sign_in(api, PETER)
    response = api.get("/api/me/friends/progress")

    assert set(response.json()[0]) == {"user_id", "display_name", "watched_ids"}
    assert "private" not in response.text
    assert "mj@example.com" not in response.text.lower()
    assert "MJ's order" not in response.text


def test_nothing_is_disclosed_while_the_request_is_only_pending(api, registered, mj):
    """The whole point of the handshake."""
    _sign_in(api, MJ)
    mj_code = _code(api)
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})

    _sign_in(api, PETER)
    _ask(api, mj_code)

    assert api.get("/api/me/friends").json() == []
    assert api.get("/api/me/friends/progress").json() == []


def test_the_list_carries_a_watched_count_without_the_ids(api, friends):
    """A dozen friends should not cost a dozen arrays of title ids to draw."""
    _sign_in(api, MJ)
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": CHAIN})

    _sign_in(api, PETER)
    row = api.get("/api/me/friends").json()[0]

    assert row["watched_count"] == len(CHAIN)
    assert "watched_ids" not in row


def test_only_watched_titles_count(api, friends):
    """A tracked-but-unseen row means "on the list", not "seen"."""
    _sign_in(api, MJ)
    api.post("/api/me/watch-progress/bulk", json={"movie_ids": ["iron-man"]})
    api.put("/api/me/watch-progress/thor", json={"watched_at": None})

    _sign_in(api, PETER)
    assert api.get("/api/me/friends").json()[0]["watched_count"] == 1
    assert api.get("/api/me/friends/progress").json()[0]["watched_ids"] == ["iron-man"]


# --------------------------------------------------------------------------- #
# lifecycle
# --------------------------------------------------------------------------- #


def test_deleting_an_account_takes_its_friendships_with_it(api, db, friends):
    """What makes the deletion clause of the privacy policy true for this table.

    Note which side does the deleting: MJ is `user_b_id` half the time, and the
    cascade has to fire on either column.
    """
    _sign_in(api, MJ)
    assert api.request("DELETE", "/api/auth/me", json={"password": PASSWORD}).status_code == 204

    assert db.scalars(select(Friendship)).all() == []

    _sign_in(api, PETER)
    assert api.get("/api/me/friends").json() == []


def test_a_third_account_is_kept_out_of_it(api, registered, mj):
    """Ned is nobody's friend, and the lists say so rather than leaking a name."""
    _register(api, NED, "Ned")
    body = api.get("/api/me/friends/progress").json()

    assert body == []
    assert api.get("/api/me/friends/requests").json() == {"incoming": [], "outgoing": []}


def test_friend_routes_need_a_session(api):
    assert api.get("/api/me/friends").status_code == 401
    assert api.get("/api/me/friends/code").status_code == 401
    assert api.post("/api/me/friends/code").status_code == 401
    assert api.get("/api/me/friends/requests").status_code == 401
    assert api.get("/api/me/friends/progress").status_code == 401
    assert api.post("/api/me/friends/requests", json={"code": "ZZZZZZZZZZ"}).status_code == 401

    stranger = uuid.uuid4()
    assert api.post(f"/api/me/friends/requests/{stranger}/accept").status_code == 401
    assert api.delete(f"/api/me/friends/requests/{stranger}").status_code == 401
    assert api.delete(f"/api/me/friends/{stranger}").status_code == 401
