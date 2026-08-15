"""Per-user data: saved orders, watch progress, preferences.

Mounted at /api/me rather than extending /api/orders, and not by taste. The
orders router already serves four literal segments (/release, /chronological,
/validate, /complete); adding /api/orders/{order_id} beside them would make
/api/orders/release resolve by declaration order. "The current user's orders"
also reads correctly, and keeps every authenticated route under one prefix.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CatalogDep, CurrentUserDep, DbDep
from app.catalog import Catalog
from app.models.custom_order import CustomOrder, CustomOrderItem
from app.models.user import User
from app.models.watch_progress import WatchProgress
from app.schemas.auth import PreferencesUpdate, UserOut
from app.schemas.me import (
    MAX_IMPORTED_PROGRESS,
    CustomOrderCreate,
    CustomOrderOut,
    CustomOrderUpdate,
    ImportRequest,
    ImportResult,
    WatchProgressBulk,
    WatchProgressEntry,
)

router = APIRouter(prefix="/me", tags=["me"])


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _known(catalog: Catalog, movie_ids: Iterable[str]) -> tuple[list[str], list[str]]:
    """Split ids into (in the catalog, not in the catalog), deduped in order.

    Every movie_id is a foreign key to `movies`, which is populated by the seed
    loader from the same JSON the catalog is built from. Checking here turns
    what would be an opaque 500 from a FK violation into a 422 that names the
    offending ids.
    """
    unique = list(dict.fromkeys(movie_ids))
    known = [movie_id for movie_id in unique if movie_id in catalog]
    unknown = [movie_id for movie_id in unique if movie_id not in catalog]
    return known, unknown


def _reject_unknown(unknown: Sequence[str]) -> None:
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown title ids: {', '.join(unknown)}",
        )


def _replace_items(db: Session, order: CustomOrder, movie_ids: Sequence[str]) -> None:
    """Renumber an order's items by deleting them all and reinserting.

    Not via the ORM collection. Assigning `item.position = i` in a loop, or
    reassigning `order.items`, both trip the (order_id, position) unique
    constraint on any backend that checks immediately -- SQLAlchemy's unit of
    work emits INSERTs before DELETEs for a single mapper, so the intermediate
    state genuinely collides. The constraint is DEFERRABLE on Postgres and would
    survive it there, but depending on that makes the code untestable on SQLite
    and fragile if the constraint ever changes.

    Delete-then-insert also sidesteps diffing "which rows moved" entirely, which
    is the whole problem a drag-and-drop reorder poses.
    """
    db.execute(delete(CustomOrderItem).where(CustomOrderItem.order_id == order.id))
    db.flush()

    if movie_ids:
        db.execute(
            insert(CustomOrderItem),
            [
                {"order_id": order.id, "movie_id": movie_id, "position": position}
                for position, movie_id in enumerate(movie_ids)
            ],
        )


def _to_out(order: CustomOrder) -> CustomOrderOut:
    return CustomOrderOut(
        id=order.id,
        name=order.name,
        movie_ids=[item.movie_id for item in order.items],
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _load_order(db: Session, user: User, order_id: uuid.UUID) -> CustomOrder:
    """404, never 403, when the order belongs to somebody else.

    A 403 would confirm the id exists, which is more than a stranger should
    learn from guessing.
    """
    order = db.scalar(
        select(CustomOrder)
        .where(CustomOrder.id == order_id, CustomOrder.user_id == user.id)
        .options(selectinload(CustomOrder.items))
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


def _free_name(db: Session, user: User, wanted: str) -> tuple[str, bool]:
    """A name that will not collide with uq_custom_orders_user_id_name.

    Returns the name and whether it had to be changed. Used only by the import
    path: a merge must never fail wholesale because one order shares a name with
    something already in the account.
    """
    taken = set(
        db.scalars(select(CustomOrder.name).where(CustomOrder.user_id == user.id)).all()
    )
    if wanted not in taken:
        return wanted, False

    for suffix in range(2, 1000):
        candidate = f"{wanted} ({suffix})"
        if candidate not in taken:
            return candidate, True
    return f"{wanted} ({uuid.uuid4().hex[:8]})", True


# --------------------------------------------------------------------------
# custom orders
# --------------------------------------------------------------------------


@router.get("/orders", response_model=list[CustomOrderOut])
def list_orders(user: CurrentUserDep, db: DbDep) -> list[CustomOrderOut]:
    """Most recently updated first, matching what listOrders() does locally."""
    orders = db.scalars(
        select(CustomOrder)
        .where(CustomOrder.user_id == user.id)
        .order_by(CustomOrder.updated_at.desc())
        .options(selectinload(CustomOrder.items))
    ).all()
    return [_to_out(order) for order in orders]


@router.post("/orders", response_model=CustomOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: CustomOrderCreate, user: CurrentUserDep, db: DbDep, catalog: CatalogDep
) -> CustomOrderOut:
    known, unknown = _known(catalog, payload.movie_ids)
    _reject_unknown(unknown)

    existing_name = db.scalar(
        select(CustomOrder.id).where(
            CustomOrder.user_id == user.id, CustomOrder.name == payload.name
        )
    )
    if existing_name is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an order with that name.",
        )

    order = CustomOrder(id=payload.id or uuid.uuid4(), user_id=user.id, name=payload.name)
    db.add(order)
    db.flush()
    _replace_items(db, order, known)
    db.commit()

    return _to_out(_load_order(db, user, order.id))


@router.get("/orders/{order_id}", response_model=CustomOrderOut)
def get_order(order_id: uuid.UUID, user: CurrentUserDep, db: DbDep) -> CustomOrderOut:
    return _to_out(_load_order(db, user, order_id))


@router.put("/orders/{order_id}", response_model=CustomOrderOut)
def update_order(
    order_id: uuid.UUID,
    payload: CustomOrderUpdate,
    user: CurrentUserDep,
    db: DbDep,
    catalog: CatalogDep,
) -> CustomOrderOut:
    order = _load_order(db, user, order_id)
    known, unknown = _known(catalog, payload.movie_ids)
    _reject_unknown(unknown)

    clash = db.scalar(
        select(CustomOrder.id).where(
            CustomOrder.user_id == user.id,
            CustomOrder.name == payload.name,
            CustomOrder.id != order.id,
        )
    )
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an order with that name.",
        )

    order.name = payload.name
    _replace_items(db, order, known)
    db.commit()

    return _to_out(_load_order(db, user, order_id))


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: uuid.UUID, user: CurrentUserDep, db: DbDep) -> None:
    order = _load_order(db, user, order_id)
    # cascade="all, delete-orphan" on the relationship takes the items with it.
    db.delete(order)
    db.commit()


# --------------------------------------------------------------------------
# watch progress
# --------------------------------------------------------------------------


@router.get("/watch-progress", response_model=dict[str, WatchProgressEntry])
def get_watch_progress(user: CurrentUserDep, db: DbDep) -> dict[str, WatchProgressEntry]:
    """A map keyed by title id, not a list.

    This is exactly the snapshot shape `frontend/src/lib/watchStorage.js` holds,
    so hydrating the store on sign-in needs no reshaping at all.
    """
    rows = db.scalars(select(WatchProgress).where(WatchProgress.user_id == user.id)).all()
    return {row.movie_id: WatchProgressEntry.model_validate(row) for row in rows}


def _upsert_progress(
    db: Session, user: User, movie_id: str, entry: WatchProgressEntry
) -> WatchProgress:
    # Session.get takes a tuple for a composite primary key. A plain
    # get-then-update beats an ON CONFLICT upsert here: one row, one user, no
    # contention to speak of, and it stays portable to SQLite for the tests.
    row = db.get(WatchProgress, (user.id, movie_id))
    if row is None:
        row = WatchProgress(user_id=user.id, movie_id=movie_id)
        db.add(row)
    row.watched_at = entry.watched_at
    row.rating = entry.rating
    row.notes = entry.notes
    return row


@router.put("/watch-progress/{movie_id}", response_model=WatchProgressEntry)
def set_watch_progress(
    movie_id: str,
    payload: WatchProgressEntry,
    user: CurrentUserDep,
    db: DbDep,
    catalog: CatalogDep,
) -> WatchProgressEntry:
    _reject_unknown([] if movie_id in catalog else [movie_id])
    row = _upsert_progress(db, user, movie_id, payload)
    db.commit()
    db.refresh(row)
    return WatchProgressEntry.model_validate(row)


@router.delete("/watch-progress/{movie_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_watch_progress(movie_id: str, user: CurrentUserDep, db: DbDep) -> None:
    """Deletes the row rather than nulling watched_at.

    watchStorage removes the key on untoggle, on the grounds that a
    tracked-but-unwatched row means nothing without a watchlist feature. The
    server matches so the two backends stay indistinguishable.
    """
    db.execute(
        delete(WatchProgress).where(
            WatchProgress.user_id == user.id, WatchProgress.movie_id == movie_id
        )
    )
    db.commit()


@router.post("/watch-progress/bulk", response_model=dict[str, WatchProgressEntry])
def bulk_mark_watched(
    payload: WatchProgressBulk, user: CurrentUserDep, db: DbDep, catalog: CatalogDep
) -> dict[str, WatchProgressEntry]:
    """Backs "mark this whole chain watched" on the prerequisite graph.

    Already-watched titles keep their original timestamp -- markManyWatched does
    the same, and rewriting them would misreport when they were seen.
    """
    known, unknown = _known(catalog, payload.movie_ids)
    _reject_unknown(unknown)

    now = datetime.now(UTC)
    for movie_id in known:
        row = db.get(WatchProgress, (user.id, movie_id))
        if row is None:
            db.add(WatchProgress(user_id=user.id, movie_id=movie_id, watched_at=now))
        elif row.watched_at is None:
            row.watched_at = now
    db.commit()

    return get_watch_progress(user, db)


@router.delete("/watch-progress", status_code=status.HTTP_204_NO_CONTENT)
def reset_watch_progress(user: CurrentUserDep, db: DbDep) -> None:
    db.execute(delete(WatchProgress).where(WatchProgress.user_id == user.id))
    db.commit()


# --------------------------------------------------------------------------
# preferences
# --------------------------------------------------------------------------


@router.patch("/preferences", response_model=UserOut)
def update_preferences(
    payload: PreferencesUpdate, user: CurrentUserDep, db: DbDep
) -> UserOut:
    """Merge semantics: keys left unset keep their current value."""
    # Reassigning rather than mutating: SQLAlchemy does not track in-place
    # changes to a plain JSON value, so a mutated dict never flushes.
    user.preferences = {**user.preferences, **payload.model_dump(exclude_none=True)}
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


# --------------------------------------------------------------------------
# first-login merge
# --------------------------------------------------------------------------


@router.post("/import", response_model=ImportResult)
def import_local_data(
    payload: ImportRequest, user: CurrentUserDep, db: DbDep, catalog: CatalogDep
) -> ImportResult:
    """Take everything a guest browser was holding into this account.

    Conflict policy, all of it chosen so a merge can never destroy account data
    and never fails as a whole:

    * order id already owned by this user -> skip. Makes a repeated submission
      idempotent, which matters because React StrictMode double-invokes effects.
    * order id owned by somebody else -> mint a fresh one. Two people sharing a
      browser should not be able to collide.
    * name already taken -> suffix it and report the rename, rather than 409 the
      whole batch over a cosmetic clash.
    * watch progress -> the account's existing row wins. Signing in on a second
      device must not overwrite what is already there with whatever that device
      happened to know.
    * unknown title id -> dropped and reported. Old localStorage may still name
      titles that have since left the catalog, and that is not worth failing on.

    One transaction: a half-applied merge would leave the user unable to tell
    what made it across.
    """
    if payload.progress_is_oversized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"At most {MAX_IMPORTED_PROGRESS} watch progress entries can be imported.",
        )

    unknown: list[str] = []
    orders_imported = 0
    orders_skipped = 0
    orders_renamed: list[str] = []

    owned_ids = set(
        db.scalars(select(CustomOrder.id).where(CustomOrder.user_id == user.id)).all()
    )

    for incoming in payload.orders:
        order_id = incoming.id
        if order_id is not None and order_id in owned_ids:
            orders_skipped += 1
            continue
        if order_id is not None and db.get(CustomOrder, order_id) is not None:
            order_id = None  # belongs to another account; give this one its own

        known, missing = _known(catalog, incoming.movie_ids)
        unknown.extend(missing)

        name, renamed = _free_name(db, user, incoming.name)
        if renamed:
            orders_renamed.append(name)

        order = CustomOrder(id=order_id or uuid.uuid4(), user_id=user.id, name=name)
        if incoming.created_at is not None:
            order.created_at = incoming.created_at
        if incoming.updated_at is not None:
            order.updated_at = incoming.updated_at
        db.add(order)
        db.flush()
        _replace_items(db, order, known)
        owned_ids.add(order.id)
        orders_imported += 1

    progress_imported = 0
    for movie_id, entry in payload.watch_progress.items():
        if movie_id not in catalog:
            unknown.append(movie_id)
            continue
        if db.get(WatchProgress, (user.id, movie_id)) is not None:
            continue
        _upsert_progress(db, user, movie_id, entry)
        progress_imported += 1

    if payload.preferences is not None:
        user.preferences = {
            **user.preferences,
            **payload.preferences.model_dump(exclude_none=True),
        }

    db.commit()

    return ImportResult(
        orders_imported=orders_imported,
        orders_skipped=orders_skipped,
        orders_renamed=orders_renamed,
        watch_progress_imported=progress_imported,
        unknown_movie_ids=list(dict.fromkeys(unknown)),
    )
