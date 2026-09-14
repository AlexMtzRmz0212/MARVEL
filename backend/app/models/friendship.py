from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import FriendshipStatus, sql_in
from app.db.base import Base


class Friendship(Base):
    """One relationship between two accounts, stored once rather than twice.

    **The pair is canonically ordered**: `user_a_id` always holds the smaller of
    the two uuids and `user_b_id` the larger, enforced by a CHECK. That single
    constraint does three jobs at once. It makes the composite primary key a
    real uniqueness guarantee -- without it (A,B) and (B,A) are different rows,
    and two people pressing "add" at the same moment would each end up with a
    request the other could not see. It rules out self-friendship, because the
    inequality is strict. And it means "are these two friends" is one indexed
    lookup rather than an OR over two columns.

    Ordering uuids is well defined on both backends and agrees between them:
    Python compares `uuid.UUID` by its 128-bit integer value, Postgres compares
    its native uuid by byte order, and SQLite compares the lowercase hex that
    `sqlalchemy.Uuid` stores there -- all three give the same answer. The
    canonicalisation itself happens in `app.services.friends.ordered_pair`; this
    CHECK is what stops anything bypassing it.

    `requested_by_id` is the direction, kept separately because the canonical
    ordering has destroyed it. It is what lets an incoming request be told from
    an outgoing one, which is the whole difference between "accept or decline"
    and "waiting on them". The CHECK pinning it to one of the two parties is
    cheap and rules out a row that would render as a request from a stranger.

    There is no reverse relationship on `User`. A friendship is not owned by
    either side, and a `user.friendships` collection would have to be the union
    of two foreign keys, which SQLAlchemy has no natural way to express. The
    service module queries the table directly instead. Deletion still cascades:
    all three foreign keys are ON DELETE CASCADE, so erasing an account takes
    every friendship it was party to with it -- which is what the privacy policy
    promises, and `test_friends` asserts.
    """

    __tablename__ = "friendships"

    user_a_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    user_b_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[str] = mapped_column(String(16), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # When the request was accepted, and therefore "friends since". NULL while
    # it is still pending, which is exactly the rows that have no such date.
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("user_a_id < user_b_id", name="ordered_pair"),
        CheckConstraint("requested_by_id IN (user_a_id, user_b_id)", name="requester_is_a_party"),
        CheckConstraint(sql_in("status", FriendshipStatus), name="status"),
        # The primary key already indexes (user_a_id, user_b_id) and therefore
        # user_a_id alone. "Everything for this user" matches on either column,
        # so the trailing one needs an index of its own or half of every
        # friends-list query is a sequential scan.
        Index("ix_friendships_user_b_id", "user_b_id"),
    )

    def other_than(self, user_id: uuid.UUID) -> uuid.UUID:
        """The party that is not the caller. The canonical ordering hides which
        column that is, and every read of this table wants it."""
        return self.user_b_id if self.user_a_id == user_id else self.user_a_id

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Friendship {self.user_a_id}~{self.user_b_id} {self.status}>"
