from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.movie import Movie
    from app.models.user import User


class CustomOrder(Base):
    __tablename__ = "custom_orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Cheap to carry now; it is what a share link would key off later.
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="custom_orders")
    items: Mapped[list[CustomOrderItem]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="CustomOrderItem.position",
    )

    __table_args__ = (UniqueConstraint("user_id", "name"),)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<CustomOrder {self.name!r}>"


class CustomOrderItem(Base):
    __tablename__ = "custom_order_items"

    # Composite primary key, so "a title appears at most once per order" is
    # structural rather than something the application has to remember.
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("custom_orders.id", ondelete="CASCADE"), primary_key=True
    )
    movie_id: Mapped[str] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped[CustomOrder] = relationship(back_populates="items")
    movie: Mapped[Movie] = relationship()

    __table_args__ = (
        CheckConstraint("position >= 0", name="position_non_negative"),
        # This is the constraint that genuinely needs deferrability: saving a
        # drag-and-drop reorder renumbers many rows at once, and the
        # intermediate states legitimately collide.
        UniqueConstraint("order_id", "position", deferrable=True, initially="DEFERRED"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<CustomOrderItem {self.movie_id}@{self.position}>"
