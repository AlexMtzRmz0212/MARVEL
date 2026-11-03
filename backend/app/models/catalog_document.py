from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Deliberately `json`, not `jsonb`. Postgres normalises jsonb: it drops key order
# and whitespace, so a document that went in looking like mcu.json would come out
# as a different file -- and the whole point of keeping the shape is that an
# export from here drops back into the repo as a readable diff. `json` stores
# the text it was given. Nothing queries inside the document.


class CatalogDocument(Base):
    """The live catalog: the whole of `mcu.json`, as one row.

    A single document rather than a normalised schema because the catalog is
    edited and validated as a whole -- the loader's checks (cycles, dangling
    edges, a chronology that contradicts its own prerequisites) are properties
    of the document, not of any row -- and because it keeps credit scenes and
    edge notes from each needing columns and a migration. `movies` and
    `prerequisites` are still kept in step on every save, because user data
    holds foreign keys into them.
    """

    __tablename__ = "catalog_document"

    # Always 1. The CHECK is what makes "the" catalog a fact the database
    # enforces rather than a habit of the code that writes it.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    document: Mapped[dict] = mapped_column(JSON, nullable=False)

    # Content hash of the serialised document: the optimistic-concurrency token
    # the editor sends back, and what the public API compares to notice an edit.
    revision: Mapped[str] = mapped_column(String(16), nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)


class CatalogHistory(Base):
    """Every document the catalog has been replaced by, newest last.

    The undo path now that the file is not in git: a bad edit that validates is
    still a bad edit, and this is what makes it recoverable. Pruned to the last
    few dozen on each save.
    """

    __tablename__ = "catalog_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    revision: Mapped[str] = mapped_column(String(16), nullable=False)
    document: Mapped[dict] = mapped_column(JSON, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
