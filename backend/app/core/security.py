"""Password hashing and session tokens.

Framework-free on purpose, the same way `core/graph.py` is: these are pure
functions over strings and uuids, so they can be unit tested without a request
and reused from a script if one ever needs to mint a token.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

# The session cookie's name lives here rather than in the route module so the
# dependency that reads it and the routes that write it cannot disagree.
COOKIE_NAME = "mcu_session"

ALGORITHM = "HS256"

# The catalog editor's session is a second cookie, not a flag on the user's.
# Unlocking the editor is a statement about who knows the admin password, not
# about which account is signed in -- and a signed-in user must not be able to
# reach it, nor the admin cookie be mistaken for a user session. The distinct
# audience claim is what keeps the two token kinds from decoding as each other:
# PyJWT rejects a token whose `aud` it was not asked to expect, and rejects one
# that has none when it is asked for one.
ADMIN_COOKIE_NAME = "mcu_admin"
ADMIN_AUDIENCE = "mcu-admin"
ADMIN_TOKEN_EXPIRE_MINUTES = 60 * 12

# Built once at import: constructing the argon2 hasher is not free, and every
# login pays for it otherwise. `recommended()` pins the parameters pwdlib
# currently considers safe, so a future upgrade moves them for us -- which is
# what `verify_password`'s second return value exists to handle.
_password_hash = PasswordHash.recommended()


def hash_password(raw: str) -> str:
    return _password_hash.hash(raw)


def verify_password(raw: str, hashed: str) -> tuple[bool, str | None]:
    """Check a password, and report a rehash when the parameters have moved on.

    The second element is a fresh hash when `hashed` was made with outdated
    argon2 parameters, and None otherwise. Callers should write it back, which
    upgrades every active user's hash transparently on their next login and
    saves a migration that could not compute the new values anyway.
    """
    return _password_hash.verify_and_update(raw, hashed)


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID | None:
    """The user id a token carries, or None if it is unusable for any reason.

    Expired, tampered with, signed by a rotated key, or carrying a subject that
    is not a uuid all collapse to the same answer, because every caller wants
    exactly one thing: a user id it can trust, or nothing.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM]
        )
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


def create_admin_token() -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": "admin",
        "aud": ADMIN_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=ADMIN_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=ALGORITHM)


def is_admin_token(token: str) -> bool:
    """True only for an unexpired token this server minted for the editor."""
    settings = get_settings()
    try:
        jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[ALGORITHM],
            audience=ADMIN_AUDIENCE,
        )
    except jwt.PyJWTError:
        return False
    return True
