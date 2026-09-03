"""The two sides of a share link: the owner's token, and what it discloses."""

from __future__ import annotations

from pydantic import BaseModel


class ShareLinkOut(BaseModel):
    """The caller's own token. `None` means they have not opted in, or revoked."""

    token: str | None


class SharedProgressOut(BaseModel):
    """Everything a share link hands to whoever holds it.

    A list of ids rather than the `dict[str, WatchProgressEntry]` shape that
    `GET /api/me/watch-progress` returns. That one carries `notes` -- free text,
    plainly private -- and `rating`, which nothing compares yet. Naming the
    fields separately here is the point: a field added to WatchProgressEntry
    later cannot leak through this door by accident, because this door does not
    open on that model at all.

    `display_name` is nullable and non-unique, so it is a label and not an
    identity. The email is never included.
    """

    display_name: str | None
    watched_ids: list[str]
