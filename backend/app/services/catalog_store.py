"""Reading and writing the live catalog document.

The catalog editor's persistence layer. The document is the same shape as
`mcu.json`; this module is what turns "the editor sent a document" into "the
public site is serving it", in the order that cannot leave the two disagreeing:

1. the revision the editor loaded must still be the stored one (else it would
   undo someone else's edit);
2. the document must pass every check the app runs at startup, plus the
   recommended orders -- so nothing can be saved that would then fail to load;
3. the old document goes to history, the new one is stored, and `movies` and
   `prerequisites` are reconciled, all in one transaction, because saved orders
   and watch progress hold foreign keys into them;
4. the in-process catalog is dropped so the next request rebuilds it.

Nothing is written unless all of that succeeds.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.catalog import build_catalog_from, invalidate
from app.models import CatalogDocument, CatalogHistory, CustomOrderItem, Movie, WatchProgress
from app.seed.loader import load
from app.seed.reader import DEFAULT_SEED_PATH, validate_document
from app.seed.schema import SeedValidationError, ValidatedCatalog
from app.services.recommended import build_recommended, read_curated

# How many replaced documents are kept. Each is ~130 KB, so this is a few MB.
HISTORY_LIMIT = 30


class RevisionConflict(Exception):
    """The stored catalog is not the revision the editor was looking at."""


class InvalidCatalog(Exception):
    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


@dataclass(frozen=True, slots=True)
class StoredCatalog:
    document: dict[str, Any]
    revision: str
    updated_at: datetime | None


# --------------------------------------------------------------------------- #
# Serialising
# --------------------------------------------------------------------------- #
def revision_of(text: str) -> str:
    """A short content hash, used as an optimistic-concurrency token.

    Two editor tabs open on one catalog is the failure that costs an afternoon:
    the stale one writes its whole document back and silently reinstates every
    edge the other had removed. The client sends back the revision it loaded, and
    a write against a stale one is refused rather than merged.

    Content-addressed rather than a counter, so it survives a restart and means
    the same thing for a document imported from the file as for one saved here.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def serialise(document: dict[str, Any]) -> str:
    """The document as `mcu.json` is written: the export and the revision both use it."""
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


# --------------------------------------------------------------------------- #
# Validating
# --------------------------------------------------------------------------- #
def check(document: dict[str, Any]) -> tuple[ValidatedCatalog | None, list[str], list[str]]:
    """Run every check the app runs at startup. Returns (catalog, problems, warnings).

    Beyond the loader's own two stages this also builds the recommended orders,
    which are checked against the catalog the first time anyone asks for them.
    Deleting a title that a curated list names would otherwise save cleanly and
    then turn `/api/orders/recommended` into a 500.
    """
    try:
        validated = validate_document(document)
    except SeedValidationError as exc:
        return None, list(exc.problems), []

    try:
        build_recommended(build_catalog_from(validated), read_curated())
    except SeedValidationError as exc:
        return None, list(exc.problems), list(validated.warnings)
    return validated, [], list(validated.warnings)


# --------------------------------------------------------------------------- #
# Reading
# --------------------------------------------------------------------------- #
def ensure_document(session: Session) -> StoredCatalog:
    """The stored catalog, importing the bundled `mcu.json` first if there is none.

    This is the whole of the migration from file to database: no separate step
    to remember, and the first time the editor is opened is the moment it
    becomes the source of truth.
    """
    row = session.get(CatalogDocument, 1)
    if row is None:
        text = DEFAULT_SEED_PATH.read_text(encoding="utf-8")
        row = CatalogDocument(id=1, document=json.loads(text), revision=revision_of(text))
        session.add(row)
        try:
            session.commit()
        except Exception:
            # Two first requests raced and the other won; theirs is the same file.
            session.rollback()
            row = session.get(CatalogDocument, 1)
            if row is None:
                raise
        else:
            invalidate()
    return StoredCatalog(row.document, row.revision, row.updated_at)


def usage_of(session: Session, movie_id: str) -> dict[str, int]:
    """How much user data hangs off a title -- what deleting it would destroy."""

    def count(model: Any) -> int:
        return (
            session.scalar(
                select(func.count()).select_from(model).where(model.movie_id == movie_id)
            )
            or 0
        )

    return {"watch_progress": count(WatchProgress), "order_items": count(CustomOrderItem)}


# --------------------------------------------------------------------------- #
# Writing
# --------------------------------------------------------------------------- #
def _title_ids(document: dict[str, Any]) -> set[str]:
    return {movie["id"] for movie in document.get("movies", []) if isinstance(movie, dict)}


def save_document(
    session: Session, document: dict[str, Any], expected_revision: str
) -> StoredCatalog:
    """Validate, then store and publish -- or raise and change nothing."""
    current = ensure_document(session)
    if current.revision != expected_revision:
        raise RevisionConflict

    validated, problems, _ = check(document)
    if validated is None:
        raise InvalidCatalog(problems)

    new_revision = revision_of(serialise(document))
    if new_revision == current.revision:
        return current

    try:
        session.add(CatalogHistory(revision=current.revision, document=current.document))
        row = session.get(CatalogDocument, 1)
        row.document = document
        row.revision = new_revision
        row.updated_at = func.now()

        # Reconcile `movies` and the edges in the same transaction. Only titles
        # the editor itself removed are deleted: anything else the table holds
        # that the document does not is left alone, since deleting a `movies`
        # row cascades into every user's progress on it.
        load(session, validated, commit=False)
        removed = _title_ids(current.document) - _title_ids(document)
        if removed:
            session.execute(delete(Movie).where(Movie.id.in_(removed)))

        keep = select(CatalogHistory.id).order_by(CatalogHistory.id.desc()).limit(HISTORY_LIMIT)
        session.execute(delete(CatalogHistory).where(CatalogHistory.id.not_in(keep)))
        session.commit()
    except Exception:
        session.rollback()
        raise

    invalidate()
    session.refresh(row)
    return StoredCatalog(row.document, row.revision, row.updated_at)


def list_history(session: Session, limit: int = 15) -> list[dict[str, Any]]:
    rows = session.execute(
        select(CatalogHistory).order_by(CatalogHistory.id.desc()).limit(limit)
    ).scalars()
    return [
        {
            "id": entry.id,
            "revision": entry.revision,
            "saved_at": entry.saved_at,
            "titles": len(entry.document.get("movies", [])),
        }
        for entry in rows
    ]


def restore(session: Session, history_id: int, expected_revision: str) -> StoredCatalog:
    """Make an earlier document current again. It is a save like any other.

    So it is validated afresh -- an old document may no longer fit `episodes.json`
    -- and the document it replaces goes to history in turn, which makes a
    restore itself undoable.
    """
    entry = session.get(CatalogHistory, history_id)
    if entry is None:
        raise InvalidCatalog([f"There is no saved version {history_id}."])
    return save_document(session, copy.deepcopy(entry.document), expected_revision)
