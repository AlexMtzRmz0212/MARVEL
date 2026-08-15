from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class _NormalisedEmail(BaseModel):
    """Lowercases and trims the email before anything else looks at it.

    `mode="before"` is required: it has to run ahead of EmailStr so that both
    the validation and the value that reaches the database see the same
    canonical form. This is the validator `app.models.user.User.email` refers
    to, and it is what makes the plain unique index sufficient -- no functional
    index on lower(email) needed.

    Shared by register and login so the two can never normalise differently,
    which would present as "I can register but not sign in".
    """

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _normalise_email(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value


class RegisterRequest(_NormalisedEmail):
    email: EmailStr
    # The upper bound is not cosmetic. Argon2 has no bcrypt-style input
    # truncation, so an unbounded password is a CPU-exhaustion vector at
    # 64 MiB and ~50-100ms of work per hash.
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)


class LoginRequest(_NormalisedEmail):
    email: EmailStr
    password: str = Field(max_length=128)


class Preferences(BaseModel):
    """The account-synced display settings.

    Deliberately a closed schema rather than a free dict: the column is JSON, so
    without this nothing stops it accumulating whatever the client felt like
    sending.
    """

    watched_display_mode: Literal["fade", "hide"] | None = None


class PreferencesUpdate(Preferences):
    """Same shape; PATCH semantics are "merge the non-null keys"."""


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    created_at: datetime
    preferences: dict
