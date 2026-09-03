"""Add an opt-in share token to users

Comparing progress with a friend needs some way for one account to address
another, and the cheapest one that leaks nothing is a capability URL: a random
token the owner mints for themselves and hands out, rather than a public handle
that would make every account enumerable.

NULL means sharing is off, which is the default and the state every existing row
starts in. Revoking sets it back to NULL and re-enabling mints a fresh value, so
a link that has been withdrawn can never be resurrected -- that is why there is
no separate `share_enabled` flag to fall out of step with the token.

The unique constraint is also the lookup index: `GET /api/share/{token}` is the
only reader, and it matches on equality.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_user_share_token"
down_revision: str | None = "0007_retire_adjacent_tier"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("share_token", sa.String(length=24), nullable=True))
    op.create_unique_constraint("uq_users_share_token", "users", ["share_token"])


def downgrade() -> None:
    op.drop_constraint("uq_users_share_token", "users", type_="unique")
    op.drop_column("users", "share_token")
