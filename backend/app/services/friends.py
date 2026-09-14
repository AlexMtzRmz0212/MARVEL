"""The social graph: friend codes, requests, and what a friend may see.

Kept out of the route module for the same reason `services/accounts.py` is --
the interesting behaviour here is the state machine, not the wire format, and it
is worth being able to test without a TestClient.

**How two accounts find each other.** Not by email, and not by a public handle.
Either would make every account enumerable: an endpoint that answers "is there a
user at this address" is an address oracle whether or not it returns anything
else, and migration 0008 already rejected a public handle on exactly those
grounds when it chose a capability URL for share links. So each account carries a
random `friend_code` that it hands out deliberately. Fifty bits of entropy is far
past guessing, and the only thing guessing one correctly would win is the right
to appear in somebody's requests list and be declined.

**What the code is not.** It is not a share token. Holding somebody's code
discloses nothing at all -- not their name, not whether the code is even real
until you try it -- and grants nothing until they accept. That asymmetry is why
the code is always present while the share token is opt-in, and why the code has
no "off" switch: rotating it invalidates every copy anybody is holding, which is
the only control the threat model needs.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import FriendshipStatus
from app.models.friendship import Friendship
from app.models.user import User
from app.models.watch_progress import WatchProgress

# Crockford's base32: the digits and the uppercase letters, less I, L, O and U.
# I/L/O are dropped because they are unreadable next to 1 and 0 in the fonts
# people will actually read a code in, and U so that no random draw spells
# something unfortunate. Ten characters is a shade under fifty bits.
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 10

# The other half of dropping those letters: somebody transcribing a code by hand
# can still write the character they thought they saw, and it resolves.
_CONFUSABLES = str.maketrans({"I": "1", "L": "1", "O": "0"})


class FriendError(Exception):
    """Base for the refusals `api.routes.friends` turns into status codes."""


class UnknownCodeError(FriendError):
    """No active account carries that code."""


class SelfRequestError(FriendError):
    """You pasted your own code."""


class AlreadyFriendsError(FriendError):
    """The two are already friends."""


class RequestAlreadySentError(FriendError):
    """You have already asked, and they have not answered yet."""


class NoSuchRequestError(FriendError):
    """Nothing pending or accepted between the two, so nothing to act on."""


# --------------------------------------------------------------------------
# codes
# --------------------------------------------------------------------------


def generate_code() -> str:
    """Ten characters drawn uniformly from the alphabet.

    `secrets.choice` per character rather than slicing a base32 encoding: the
    alphabet is 32 symbols, so the draw is unbiased, and doing it directly means
    the stored value is exactly the value people read out.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalise_code(raw: str) -> str:
    """Whatever somebody typed, as it is stored.

    Forgiving on purpose, and for the same reason `tokenFromInput` is on the
    frontend: people paste a code with the display hyphen in it, in lower case,
    with a stray space from the message they copied it out of. A form that only
    accepts one exact spelling is a form that looks broken.

    Anything outside the alphabet is dropped rather than rejected, so this never
    raises -- a code that normalises to something no account holds is an unknown
    code, which is already a case the caller has to handle, and routing garbage
    down that same path means there is one failure message instead of two.
    """
    folded = raw.strip().upper().translate(_CONFUSABLES)
    return "".join(character for character in folded if character in CODE_ALPHABET)


def mint_code(db: Session) -> str:
    """A code no account currently holds.

    The retry is for a collision that will not happen -- at fifty bits a
    birthday collision needs on the order of 2^25 accounts -- but the bare unique
    violation would surface to the user as "That already exists." from the
    handler in `main.py`, which explains nothing. Mirrors `me.create_share_link`.
    """
    for _ in range(5):
        candidate = generate_code()
        if db.scalar(select(User.id).where(User.friend_code == candidate)) is None:
            return candidate

    raise RuntimeError("Could not allocate a friend code")


def rotate_code(db: Session, user: User) -> str:
    """Retire the code that is out there and issue a new one.

    The only control over who can ask, and deliberately the only one: every copy
    of the old code stops working at once, and friendships already accepted are
    untouched, because they are rows in their own right and never referred back
    to the code that started them.
    """
    user.friend_code = mint_code(db)
    db.commit()
    return user.friend_code


# --------------------------------------------------------------------------
# the pair
# --------------------------------------------------------------------------


def ordered_pair(one: uuid.UUID, other: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """The two ids in the order `friendships` stores them. See that model."""
    return (one, other) if one < other else (other, one)


def get_friendship(db: Session, one: uuid.UUID, other: uuid.UUID) -> Friendship | None:
    """The row between two accounts, in whichever direction it was created."""
    user_a, user_b = ordered_pair(one, other)
    return db.get(Friendship, (user_a, user_b))


def _accepted_rows(db: Session, user_id: uuid.UUID) -> list[Friendship]:
    return list(
        db.scalars(
            select(Friendship).where(
                or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id),
                Friendship.status == FriendshipStatus.ACCEPTED,
            )
        ).all()
    )


def friend_ids(db: Session, user_id: uuid.UUID) -> set[uuid.UUID]:
    """Who this account is actually friends with. The authorisation check that
    every disclosure below is gated on."""
    return {row.other_than(user_id) for row in _accepted_rows(db, user_id)}


# --------------------------------------------------------------------------
# requests
# --------------------------------------------------------------------------


def send_request(db: Session, me: User, raw_code: str) -> tuple[Friendship, User]:
    """Ask the holder of `raw_code` to be friends.

    Returns the row and the other account, so the caller can name them without
    a second lookup.

    The case worth reading twice is the last one: if *they* have already asked
    *you*, this accepts instead of refusing. Two people who independently went
    looking for each other's code have demonstrated mutual consent about as
    plainly as it can be demonstrated, and answering "you already have a request
    from them, go and find it" would be the app being obtuse about something it
    can see perfectly well. The returned row's `status` is what tells the two
    outcomes apart.
    """
    code = normalise_code(raw_code)
    if not code:
        raise UnknownCodeError(raw_code)

    other = db.scalar(select(User).where(User.friend_code == code))
    # is_active is filtered in Python rather than in the WHERE clause, the same
    # way `deps.get_current_user_optional` and `routes.share` do it: the column's
    # server default is the literal `true`, which SQLite stores as text and will
    # not match an SQL-side truth test.
    if other is None or not other.is_active:
        raise UnknownCodeError(code)

    if other.id == me.id:
        raise SelfRequestError(code)

    existing = get_friendship(db, me.id, other.id)
    if existing is not None:
        if existing.status == FriendshipStatus.ACCEPTED:
            raise AlreadyFriendsError(code)
        if existing.requested_by_id == me.id:
            raise RequestAlreadySentError(code)

        existing.status = FriendshipStatus.ACCEPTED
        existing.responded_at = datetime.now(UTC)
        db.commit()
        return existing, other

    user_a, user_b = ordered_pair(me.id, other.id)
    row = Friendship(
        user_a_id=user_a,
        user_b_id=user_b,
        requested_by_id=me.id,
        status=FriendshipStatus.PENDING,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, other


def accept_request(db: Session, me: User, requester_id: uuid.UUID) -> Friendship:
    """Say yes to a request somebody sent you.

    Only the recipient may accept, which is the `requested_by_id != me.id` half
    of the guard -- without it the sender could accept their own request and
    friendship would need no consent at all.
    """
    row = get_friendship(db, me.id, requester_id)
    if (
        row is None
        or row.status != FriendshipStatus.PENDING
        or row.requested_by_id == me.id
    ):
        raise NoSuchRequestError(requester_id)

    row.status = FriendshipStatus.ACCEPTED
    row.responded_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return row


def remove(db: Session, me: User, other_id: uuid.UUID) -> None:
    """Decline, cancel, or unfriend -- one operation, because they are one.

    All three mean "there is no longer anything between these two accounts", and
    all three are reachable by exactly one of the parties, so distinguishing them
    would buy three code paths that delete the same row. What the *caller* shows
    differs, and the caller already knows which list the button was under.
    """
    row = get_friendship(db, me.id, other_id)
    if row is None:
        raise NoSuchRequestError(other_id)

    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------


def _watched_counts(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """How many titles each of them has ticked. One grouped query, not N."""
    if not user_ids:
        return {}

    rows = db.execute(
        select(WatchProgress.user_id, func.count())
        .where(
            WatchProgress.user_id.in_(user_ids),
            WatchProgress.watched_at.is_not(None),
        )
        .group_by(WatchProgress.user_id)
    ).all()
    return {user_id: count for user_id, count in rows}


def _active_users(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not user_ids:
        return {}
    found = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    return {user.id: user for user in found if user.is_active}


def list_friends(db: Session, me: User) -> list[tuple[User, Friendship, int]]:
    """Accepted friendships as (the other person, the row, their watched count).

    The count rides along so a friends list can draw a progress bar without
    pulling every title id for every friend -- that is `friends_progress` below,
    and it is a much larger answer.

    Sorted by display name so the list does not reshuffle itself as rows are
    touched. Accounts with no display name sort last under a blank key rather
    than crashing the comparison.
    """
    rows = _accepted_rows(db, me.id)
    others = _active_users(db, [row.other_than(me.id) for row in rows])
    counts = _watched_counts(db, list(others))

    pairs = [
        (others[row.other_than(me.id)], row, counts.get(row.other_than(me.id), 0))
        for row in rows
        if row.other_than(me.id) in others
    ]
    return sorted(pairs, key=lambda pair: ((pair[0].display_name or "").lower(), str(pair[0].id)))


PendingList = list[tuple[User, Friendship]]


def list_requests(db: Session, me: User) -> tuple[PendingList, PendingList]:
    """Pending requests as (incoming, outgoing).

    One query and a split in Python rather than two queries differing only in a
    direction predicate: the rows are the same rows, and `requested_by_id` is the
    whole of the distinction.
    """
    rows = list(
        db.scalars(
            select(Friendship).where(
                or_(Friendship.user_a_id == me.id, Friendship.user_b_id == me.id),
                Friendship.status == FriendshipStatus.PENDING,
            )
        ).all()
    )
    others = _active_users(db, [row.other_than(me.id) for row in rows])

    incoming: PendingList = []
    outgoing: PendingList = []
    for row in rows:
        other = others.get(row.other_than(me.id))
        if other is None:
            continue
        (outgoing if row.requested_by_id == me.id else incoming).append((other, row))

    return (
        sorted(incoming, key=lambda pair: pair[1].created_at, reverse=True),
        sorted(outgoing, key=lambda pair: pair[1].created_at, reverse=True),
    )


def friends_progress(db: Session, me: User) -> list[tuple[User, list[str]]]:
    """Every accepted friend and the titles they have marked watched.

    The disclosure, and the only one this module makes. Scoped to match what a
    share link gives away and no wider -- a display name and which titles have
    been ticked, never the email, the ratings, the notes or the saved orders.
    `app.schemas.friends` names those fields explicitly so a field added to
    WatchProgress later cannot leak through this door by accident.

    Two queries for any number of friends, not two per friend. The second selects
    the id columns alone, so no WatchProgress instance is ever built and the
    notes never leave the database -- the same trick `routes.share` uses, for the
    same reason.
    """
    rows = _accepted_rows(db, me.id)
    others = _active_users(db, [row.other_than(me.id) for row in rows])
    if not others:
        return []

    watched: dict[uuid.UUID, list[str]] = {user_id: [] for user_id in others}
    for user_id, movie_id in db.execute(
        select(WatchProgress.user_id, WatchProgress.movie_id).where(
            WatchProgress.user_id.in_(list(others)),
            WatchProgress.watched_at.is_not(None),
        )
    ).all():
        watched[user_id].append(movie_id)

    return [(user, watched[user.id]) for user in others.values()]
