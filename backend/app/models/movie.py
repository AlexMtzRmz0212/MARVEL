from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import MediaType, Saga, Strength, Tier, Universe, sql_in
from app.db.base import Base


class Movie(Base):
    """One watchable title.

    The table keeps the name `movies` from the original spec even though it also
    holds series and specials; `media_type` is what distinguishes them.
    """

    __tablename__ = "movies"

    # A slug rather than a surrogate integer: /movies/avengers-endgame is
    # readable, the seed file diffs meaningfully, and no join is needed to
    # resolve a reference. The cost is wider foreign keys and a migration on
    # rename -- both irrelevant at this scale.
    id: Mapped[str] = mapped_column(String(80), primary_key=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    release_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    phase: Mapped[int | None] = mapped_column(Integer)  # null outside the MCU
    saga: Mapped[str] = mapped_column(String(32), nullable=False)
    universe: Mapped[str] = mapped_column(String(24), nullable=False)
    media_type: Mapped[str] = mapped_column(String(16), nullable=False)
    tier: Mapped[str] = mapped_column(String(16), nullable=False)

    runtime_min: Mapped[int | None] = mapped_column(Integer)  # null for series
    poster_url: Mapped[str | None] = mapped_column(String(500))
    synopsis: Mapped[str | None] = mapped_column(Text)

    # Both orders are stored rather than derived. release_order could be computed
    # from release_date, but storing it lets the UI say "#12 of 40" without a
    # second query and gives the topological sort a dense integer tie-break key.
    # chrono_order genuinely cannot be derived -- it is editorial (Captain Marvel
    # is set in 1995; Loki is outside time altogether) -- and is nullable because
    # adjacent titles often have no agreed in-universe placement.
    release_order: Mapped[int] = mapped_column(Integer, nullable=False)
    chrono_order: Mapped[int | None] = mapped_column(Integer)

    tmdb_id: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    prerequisite_links: Mapped[list[Prerequisite]] = relationship(
        back_populates="movie",
        foreign_keys="Prerequisite.movie_id",
        cascade="all, delete-orphan",
    )
    dependent_links: Mapped[list[Prerequisite]] = relationship(
        back_populates="prerequisite",
        foreign_keys="Prerequisite.prerequisite_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("phase IS NULL OR (phase BETWEEN 1 AND 10)", name="phase_range"),
        CheckConstraint(sql_in("saga", Saga), name="saga"),
        CheckConstraint(sql_in("universe", Universe), name="universe"),
        CheckConstraint(sql_in("media_type", MediaType), name="media_type"),
        CheckConstraint(sql_in("tier", Tier), name="tier"),
        CheckConstraint("runtime_min IS NULL OR runtime_min > 0", name="runtime_positive"),
        CheckConstraint("release_order >= 0", name="release_order_non_negative"),
        CheckConstraint(
            "chrono_order IS NULL OR chrono_order >= 0", name="chrono_order_non_negative"
        ),
        # UNIQUE catches the seed-authoring mistake of two titles claiming the
        # same slot. DEFERRABLE is what lets the loader renumber the whole
        # catalog inside one transaction without tripping over intermediate
        # collisions -- otherwise it would need the "negate everything, then set
        # the real values" two-pass dance.
        UniqueConstraint("release_order", deferrable=True, initially="DEFERRED"),
        UniqueConstraint("chrono_order", deferrable=True, initially="DEFERRED"),
        UniqueConstraint("tmdb_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Movie {self.id}>"


class Prerequisite(Base):
    """One edge of the dependency DAG: watch `prerequisite_id` before `movie_id`."""

    __tablename__ = "prerequisites"

    movie_id: Mapped[str] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True
    )
    prerequisite_id: Mapped[str] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True
    )
    strength: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=Strength.ESSENTIAL.value
    )
    note: Mapped[str | None] = mapped_column(String(280))

    movie: Mapped[Movie] = relationship(
        back_populates="prerequisite_links", foreign_keys=[movie_id]
    )
    prerequisite: Mapped[Movie] = relationship(
        back_populates="dependent_links", foreign_keys=[prerequisite_id]
    )

    __table_args__ = (
        # (movie_id, prerequisite_id) is the natural key: it dedupes for free and
        # indexes forward traversal for free.
        CheckConstraint("movie_id <> prerequisite_id", name="no_self_loop"),
        CheckConstraint(sql_in("strength", Strength), name="strength"),
        # The second column of a composite primary key gets no index of its own,
        # but reverse traversal needs one -- Kahn walks successors, and so does
        # any future "what does this unlock?" view.
        Index("ix_prerequisites_prerequisite_id", "prerequisite_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Prerequisite {self.prerequisite_id} -> {self.movie_id}>"
