from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.custom_order import CustomOrder
    from app.models.watch_progress import WatchProgress


class User(Base):
    __tablename__ = "users"

    # sqlalchemy.Uuid rather than postgresql.UUID: it renders as a native uuid on
    # Postgres and CHAR(32) on SQLite, which keeps the test suite portable.
    # A UUID rather than a serial so ids leak no user count and are safe to put
    # in a JWT subject claim.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # Normalised to lowercase by a pydantic validator on the way in, which is
    # simpler than a functional unique index and keeps the constraint plain.
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    # A JSON blob rather than a column per setting: these are small display
    # choices, they arrive free inside GET /api/auth/me (which the SPA already
    # calls once at boot), and one migration covers every preference added
    # later. app.schemas.auth.PreferencesUpdate is what keeps it from becoming
    # a junk drawer -- nothing unvalidated is ever written here.
    #
    # Assign a whole new dict when writing: SQLAlchemy does not track in-place
    # mutation of a plain JSON value, so `user.preferences["x"] = 1` never
    # flushes.
    preferences: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, server_default="{}"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    custom_orders: Mapped[list[CustomOrder]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    watch_progress: Mapped[list[WatchProgress]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<User {self.email}>"
