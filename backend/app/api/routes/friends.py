"""Friends: your code, requests in both directions, and what friends disclose.

Its own router under `/me/friends` rather than more endpoints on `routes.me`,
which is already the longest module in the API and owns three unrelated
features. FastAPI is happy with two routers sharing the `/me` stem because no
path collides, and the split keeps one feature in one file.

Route order inside the router matters for the same reason `routes.me` explains
for `/api/orders`: `/code`, `/requests` and `/progress` are literal segments that
would otherwise be swallowed by `/{user_id}`. They are declared first. The uuid
type on the parameter makes the collision unreachable anyway, but relying on a
422 from a type coercion to keep routing correct is the kind of thing that stops
being true the moment somebody widens the type.

Every route here requires a session. There is no guest half of this feature -- a
friendship is between two accounts, and a browser holding localStorage is not
one of them.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.enums import FriendshipStatus
from app.schemas.friends import (
    FriendCodeOut,
    FriendOut,
    FriendProgressOut,
    FriendRequestCreate,
    FriendRequestResult,
    PendingRequestOut,
    RequestsOut,
)
from app.services import friends as service

router = APIRouter(prefix="/me/friends", tags=["friends"])


# --------------------------------------------------------------------------
# your code
# --------------------------------------------------------------------------


@router.get("/code", response_model=FriendCodeOut)
def get_friend_code(user: CurrentUserDep) -> FriendCodeOut:
    """The code to hand out. Always present; see `app.models.user.User`."""
    return FriendCodeOut(code=user.friend_code)


@router.post("/code", response_model=FriendCodeOut)
def rotate_friend_code(user: CurrentUserDep, db: DbDep) -> FriendCodeOut:
    """Retire the code that is out there and issue a new one.

    The counterpart of revoking a share link, except that nothing is being cut
    off: existing friendships are rows in their own right and never refer back to
    the code that started them, so rotating affects only who can ask next.
    """
    return FriendCodeOut(code=service.rotate_code(db, user))


# --------------------------------------------------------------------------
# requests
# --------------------------------------------------------------------------


@router.get("/requests", response_model=RequestsOut)
def list_requests(user: CurrentUserDep, db: DbDep) -> RequestsOut:
    incoming, outgoing = service.list_requests(db, user)
    return RequestsOut(
        incoming=[
            PendingRequestOut(
                user_id=other.id,
                display_name=other.display_name,
                requested_at=row.created_at,
            )
            for other, row in incoming
        ],
        outgoing=[
            PendingRequestOut(
                user_id=other.id,
                display_name=other.display_name,
                requested_at=row.created_at,
            )
            for other, row in outgoing
        ],
    )


@router.post(
    "/requests", response_model=FriendRequestResult, status_code=status.HTTP_201_CREATED
)
def send_request(
    payload: FriendRequestCreate, user: CurrentUserDep, db: DbDep
) -> FriendRequestResult:
    """Ask the holder of a code to be friends.

    404 for an unknown code, and 404 for a code belonging to a deactivated
    account -- never a 403 and never a distinct message. Telling the two apart
    would turn this endpoint into an oracle for which codes exist, which is the
    one thing the code scheme is there to prevent.

    409 for the two states where the request is redundant, with the two of them
    worded differently because the user's next move differs: already friends
    means go and look at the friends list, already asked means wait.
    """
    try:
        row, other = service.send_request(db, user, payload.code)
    except service.SelfRequestError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That is your own friend code.",
        ) from None
    except service.UnknownCodeError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account has that friend code.",
        ) from None
    except service.AlreadyFriendsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already friends.",
        ) from None
    except service.RequestAlreadySentError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already sent them a request.",
        ) from None

    return FriendRequestResult(
        status=(
            "accepted" if row.status == FriendshipStatus.ACCEPTED else "pending"
        ),
        user_id=other.id,
        display_name=other.display_name,
    )


@router.post("/requests/{user_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_request(user_id: uuid.UUID, user: CurrentUserDep, db: DbDep) -> None:
    """Say yes. 404 covers "no such request" and "that one is yours to wait on".

    The sender accepting their own request would make friendship consentless, so
    the service refuses it -- and it comes back as 404 rather than 403 because a
    403 would confirm the row exists to somebody guessing user ids.
    """
    try:
        service.accept_request(db, user, user_id)
    except service.NoSuchRequestError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No pending request from them."
        ) from None


@router.delete("/requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def decline_request(user_id: uuid.UUID, user: CurrentUserDep, db: DbDep) -> None:
    """Decline one sent to you, or cancel one you sent. Both delete the row."""
    try:
        service.remove(db, user, user_id)
    except service.NoSuchRequestError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No request to withdraw."
        ) from None


# --------------------------------------------------------------------------
# friends
# --------------------------------------------------------------------------


@router.get("/progress", response_model=list[FriendProgressOut])
def get_friends_progress(user: CurrentUserDep, db: DbDep) -> list[FriendProgressOut]:
    """Every friend's watched titles, in one response.

    One call for all of them rather than one per friend. The compare page puts
    several people side by side, and a request each would be several database
    connections for one screen under the NullPool production runs on -- the
    constraint `app/api/deps.py` documents.
    """
    return [
        FriendProgressOut(
            user_id=friend.id,
            display_name=friend.display_name,
            watched_ids=watched_ids,
        )
        for friend, watched_ids in service.friends_progress(db, user)
    ]


@router.get("", response_model=list[FriendOut])
def list_friends(user: CurrentUserDep, db: DbDep) -> list[FriendOut]:
    return [
        FriendOut(
            user_id=friend.id,
            display_name=friend.display_name,
            watched_count=watched_count,
            friends_since=row.responded_at,
        )
        for friend, row, watched_count in service.list_friends(db, user)
    ]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(user_id: uuid.UUID, user: CurrentUserDep, db: DbDep) -> None:
    """Unfriend. Symmetrical: one row, so it ends for both of them at once.

    Nothing is retained, so either of them may ask again afterwards -- which is
    the behaviour `FriendshipStatus` argues for at length.
    """
    try:
        service.remove(db, user, user_id)
    except service.NoSuchRequestError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="They are not on your friends list."
        ) from None
