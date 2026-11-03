from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    # Bounded so a megabyte "password" cannot be used to make argon2 do work.
    password: str = Field(min_length=1, max_length=256)


class AdminSessionOut(BaseModel):
    authenticated: bool
    # True when there is no password to enter: a dev environment with none set.
    open: bool


class CatalogSaveRequest(BaseModel):
    document: dict[str, Any]
    revision: str = Field(description="The revision the client loaded, for conflict detection.")


class CatalogRestoreRequest(BaseModel):
    history_id: int
    revision: str = Field(description="The revision the client loaded, for conflict detection.")
