from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.movie import Movie
    from app.models.user import User


class WatchProgress(Base):
    """One user's relationship to one title.

    Semantics, chosen deliberately: **the row existing means "tracked", and
    `watched_at` being non-null means "watched"**. That yields a watchlist for
    free (tracked but not yet watched) and makes completion a plain count of
    non-null `watched_at`. The alternative -- row existence as the watched
    signal -- would leave `watched_at` nullable for no reason.
    """

    __tablename__ = "watch_progress"

    # Composite primary key: this is a fact about a (user, title) pair, so it
    # needs no surrogate id, and uniqueness comes for free. The leading column
    # also indexes the only query that matters ("everything for this user").
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    movie_id: Mapped[str] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True
    )

    watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(Text)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="watch_progress")
    movie: Mapped[Movie] = relationship()

    __table_args__ = (
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 10", name="rating_range"),
    )

    @property
    def is_watched(self) -> bool:
        return self.watched_at is not None

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<WatchProgress {self.movie_id} watched={self.is_watched}>"
