"""Throttling the editor's password.

One shared password protects a tool that can rewrite the catalog, so the limit on
guessing it has to hold across serverless instances -- which means it lives in
the database (`admin_attempts`), not in a counter in memory.

Per client rather than global: a global lockout would let anyone who knows the
URL keep the owner out indefinitely by failing on purpose.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.admin_attempt import AdminAttempt

MAX_FAILURES = 5
LOCK_FOR = timedelta(minutes=15)


def client_key(request: Request) -> str:
    """A salted hash of the caller's address.

    The first `X-Forwarded-For` hop is the real client on Vercel, which sets the
    header itself rather than forwarding the caller's. Hashed so the table holds
    no addresses, and salted with the signing key so the hashes cannot be
    reversed by trying every IPv4 address.
    """
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    address = forwarded or (request.client.host if request.client else "unknown")
    salt = get_settings().secret_key.get_secret_value()
    return hashlib.sha256(f"{salt}:{address}".encode()).hexdigest()[:32]


def _aware(moment: datetime) -> datetime:
    """SQLite hands back naive datetimes; Postgres hands back aware ones."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def seconds_locked(session: Session, key: str, now: datetime | None = None) -> int:
    """Seconds until this client may try again; 0 if it may now."""
    now = now or datetime.now(UTC)
    attempt = session.get(AdminAttempt, key)
    if attempt is None or attempt.locked_until is None:
        return 0
    remaining = _aware(attempt.locked_until) - now
    return max(0, int(remaining.total_seconds()) + 1)


def record_failure(session: Session, key: str, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    attempt = session.get(AdminAttempt, key)
    if attempt is None:
        attempt = AdminAttempt(key=key, failures=0)
        session.add(attempt)

    # A lock that has run out starts the count again, rather than locking on the
    # very next typo.
    if attempt.locked_until is not None and _aware(attempt.locked_until) <= now:
        attempt.failures = 0
        attempt.locked_until = None

    attempt.failures += 1
    if attempt.failures >= MAX_FAILURES:
        attempt.locked_until = now + LOCK_FOR
    session.commit()


def clear_failures(session: Session, key: str) -> None:
    attempt = session.get(AdminAttempt, key)
    if attempt is not None:
        session.delete(attempt)
        session.commit()
