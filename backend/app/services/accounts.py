"""Account creation and authentication, independent of HTTP.

Kept out of the route module for the same reason `services/validation.py` is:
the interesting behaviour (uniqueness, timing, hash rotation) is testable
without a TestClient, and the routes stay thin enough to read as a description
of the wire format.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User

# Verified against on a missing account so that "no such email" and "wrong
# password" take the same time. Hashing a constant is the cheapest way to keep
# the two paths indistinguishable without duplicating the argon2 parameters.
_TIMING_DUMMY_HASH = hash_password("timing-equalisation-only")


class EmailTakenError(Exception):
    """Raised when an address already has an account."""


def get_by_email(db: Session, email: str) -> User | None:
    """Lookup by the canonical (lowercased) address.

    Callers must pass an already-normalised address; the pydantic schemas do
    this on the way in.
    """
    return db.scalar(select(User).where(User.email == email))


def create_user(db: Session, *, email: str, password: str, display_name: str | None) -> User:
    if get_by_email(db, email) is not None:
        raise EmailTakenError(email)

    user = User(
        email=email,
        hashed_password=hash_password(password),
        display_name=display_name,
        preferences={},
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        # Two simultaneous registrations for the same address both pass the
        # check above; the unique index is the real arbiter and this turns its
        # error into the same 409 the check produces.
        db.rollback()
        raise EmailTakenError(email) from exc

    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    """Erase an account and everything hanging off it.

    Both relationships are `cascade="all, delete-orphan"`, and the underlying
    foreign keys are ON DELETE CASCADE, so this removes the user row, their
    watch progress, their custom orders and those orders' items. Nothing about
    the account survives, which is what the privacy policy promises.
    """
    db.delete(user)
    db.commit()


def authenticate(db: Session, *, email: str, password: str) -> User | None:
    user = get_by_email(db, email)
    if user is None:
        verify_password(password, _TIMING_DUMMY_HASH)
        return None

    ok, updated_hash = verify_password(password, user.hashed_password)
    if not ok or not user.is_active:
        return None

    if updated_hash is not None:
        # pwdlib's recommended parameters have moved since this hash was made.
        # Rotating here is the only moment the plaintext is available.
        user.hashed_password = updated_hash
        db.commit()

    return user
