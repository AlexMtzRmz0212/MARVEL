"""What the friends half of the API puts on the wire.

Every model here is written out field by field rather than validated from an ORM
object with `from_attributes`, and that is the whole point of the module. `User`
carries an email and a password hash; `WatchProgress` carries a rating and free
text notes. Naming the disclosed fields explicitly means a column added to either
of those later cannot leak through this door by accident, because this door does
not open on those models at all. `app/schemas/share.py` makes the same argument
at more length.

**The one thing disclosed here that a share link never discloses is the user id.**
That is deliberate and it is the difference between the two features. A share
link has no caller identity at all -- the token is the entire authorisation -- so
an id in the response would be a bare identifier handed to an anonymous stranger.
A friend, by contrast, has to be *addressed*: to accept them, to unfriend them,
to pick them out of a list of people to compare against. A v4 uuid is opaque and
unguessable, it is already what the session cookie's subject claim holds, and it
only ever reaches somebody the account has either accepted or been asked by.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FriendCodeOut(BaseModel):
    """The caller's own code. Never null -- see `app.models.user.User`."""

    code: str


class FriendRequestCreate(BaseModel):
    """Somebody else's code, as typed.

    Loosely bounded rather than pinned to the exact ten characters: the value is
    put through `services.friends.normalise_code` before anything looks it up, so
    a pasted hyphen, a lowercase transcription or a trailing space are all
    ordinary input rather than a validation error. The upper bound is only there
    to stop an unbounded string reaching the normaliser.
    """

    code: str = Field(min_length=1, max_length=64)


class FriendOut(BaseModel):
    """One accepted friend, as the friends list draws them.

    `watched_count` rather than the ids: a list of twelve friends does not need
    twelve arrays of title ids to draw twelve progress bars, and the ids are a
    separate, larger call (`FriendProgressOut`) that only the pages actually
    comparing anything make.
    """

    user_id: uuid.UUID
    display_name: str | None
    watched_count: int
    friends_since: datetime | None


class PendingRequestOut(BaseModel):
    """A request waiting on somebody, in either direction.

    The display name is disclosed before acceptance because there is no way to
    decide on a request from nobody. It is the same field a share link gives
    away, it is neither unique nor an identity, and the account that sees it
    already holds the code that produced the request.
    """

    user_id: uuid.UUID
    display_name: str | None
    requested_at: datetime


class RequestsOut(BaseModel):
    """Both directions in one response.

    One call rather than two: the friends page draws both lists and would
    otherwise spend two round trips -- and two database connections under the
    NullPool production runs on -- on one screen.
    """

    incoming: list[PendingRequestOut]
    outgoing: list[PendingRequestOut]


class FriendRequestResult(BaseModel):
    """What sending a code did.

    `status` is "accepted" rather than "pending" in exactly one case: they had
    already sent *you* a request, so yours completed the handshake instead of
    joining a queue (see `services.friends.send_request`). The UI needs to tell
    "Request sent" from "You are now friends", and this is the field that does
    it.
    """

    status: Literal["pending", "accepted"]
    user_id: uuid.UUID
    display_name: str | None


class FriendProgressOut(BaseModel):
    """Everything a friendship discloses about one friend.

    Deliberately the same shape and the same scope as `SharedProgressOut`: a
    display name and the ids of watched titles. Accepting a friend request must
    not hand over more than handing somebody a share link does, or the two
    features would disagree about what "compare progress" costs -- and the more
    generous one would be the one nobody had read the wording of.
    """

    user_id: uuid.UUID
    display_name: str | None
    watched_ids: list[str]
