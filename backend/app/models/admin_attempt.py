from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminAttempt(Base):
    """Failed editor sign-ins, per client.

    A table rather than a counter in memory because the app runs as serverless
    functions: successive requests land on different instances, so an in-process
    count never reaches the limit. The key is a salted hash of the client
    address, so the table holds no addresses.
    """

    __tablename__ = "admin_attempts"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
