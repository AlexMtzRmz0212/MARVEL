"""Resolving somebody else's share link.

The one route in the API that returns data belonging to a user other than the
caller, and the only one that is anonymous *and* touches Postgres. That second
part is worth stating plainly, because `app/api/deps.py` documents an invariant
that looks like it is being broken here: anonymous requests must not open a
database connection, since production runs on NullPool for Neon's pooler and the
catalog endpoints are overwhelmingly anonymous. The invariant is about traffic
that has no business in the database. This route's entire purpose is a database
lookup, it is reached only by deliberately following a link somebody was handed,
and it is nowhere near a page view in volume. Nothing else may be moved below
that guard on the strength of this precedent.

The token is the whole of the authorisation -- there is no caller identity to
check it against -- so the disclosure is kept as small as the feature allows:
a display name and the ids of watched titles. Never the email, the ratings, the
notes, the saved orders or the user id.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import DbDep
from app.models.user import User
from app.models.watch_progress import WatchProgress
from app.schemas.share import SharedProgressOut

router = APIRouter(prefix="/share", tags=["share"])


@router.get("/{token}", response_model=SharedProgressOut)
def get_shared_progress(token: str, db: DbDep, response: Response) -> SharedProgressOut:
    """Whatever the holder of this link is allowed to see.

    404, never 403, for a token that is unknown, revoked or belongs to a
    deactivated account -- the same policy `me._load_order` states for order
    ids, and for the same reason: a 403 would confirm to somebody guessing that
    the token exists.

    Two queries rather than one join, so that a user who has ticked nothing
    still resolves to an empty comparison instead of a 404. The second selects
    the id column alone: no WatchProgress instance is ever built, so the notes
    never leave the database.

    `is_active` is filtered in Python rather than in the WHERE clause, the same
    way `deps.get_current_user_optional` does it. Its server default is the
    literal `true`, which SQLite stores as text and will not match `IS 1` -- so
    an SQL-side check would silently 404 every account under the test suite
    while passing in production, which is the worst way for this to be wrong.
    """
    owner = db.execute(
        select(User.display_name, User.id, User.is_active).where(User.share_token == token)
    ).first()
    if owner is None or not owner.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found.")

    display_name, user_id = owner.display_name, owner.id

    watched_ids = list(
        db.scalars(
            select(WatchProgress.movie_id).where(
                WatchProgress.user_id == user_id,
                WatchProgress.watched_at.is_not(None),
            )
        ).all()
    )

    # A share link pasted into a public forum should not end up in a search
    # index, and the SPA route that wraps it is client-side, so this header is
    # the only place that can say so.
    response.headers["X-Robots-Tag"] = "noindex"

    return SharedProgressOut(display_name=display_name, watched_ids=watched_ids)
