"""Friend codes and the friendship graph

Two additions that only make sense together: a way for one account to address
another, and the relationship that addressing it can establish.

`users.friend_code` is how two people find each other. Not the email, and not a
public handle -- migration 0008 already rejected a handle for share links because
it would make every account enumerable, and the same argument applies twice over
to something that produces a notification. A code is random, it is handed out
deliberately, and rotating it invalidates every copy anybody holds.

It is NOT NULL where `share_token` is nullable, which is the whole difference
between the two. A share token *is* the authorisation, so it defaults to off. A
code authorises nothing -- the most it buys is the right to ask, and the ask has
to be accepted before a byte is disclosed -- so there is nothing to opt into and
no off state worth modelling. Existing rows are backfilled below.

`friendships` stores each relationship **once**, with the pair canonically
ordered by uuid, so the composite primary key is a real uniqueness guarantee: two
people pressing "add" simultaneously cannot end up with a request each that the
other cannot see. `requested_by_id` carries the direction the ordering destroyed,
which is what tells an incoming request from an outgoing one. See
`app/models/friendship.py` for the rest of the reasoning.

This is the first revision in the chain that cannot be rendered with
`alembic upgrade --sql`: the backfill has to read the existing ids before it can
write a distinct code against each one, and offline mode has no connection to
read them with. Nothing in this project deploys by generating SQL offline, so
that is a cost rather than a problem -- but it is why the earlier revisions are
all pure DDL and this one is not.

Revision ID: 0009_friendships
Revises: 0008_user_share_token
"""

from __future__ import annotations

import secrets
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_friendships"
down_revision: str | None = "0008_user_share_token"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept in step with app.services.friends deliberately rather than imported from
# it. A migration has to keep producing the values it produced on the day it ran,
# so it cannot depend on application code that is free to change underneath it --
# the same reason the CHECK helpers in the earlier migrations are duplicated
# there instead of imported from app.core.enums.
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 10

STATUSES = ("pending", "accepted")


def _quoted_list(values: Sequence[str]) -> str:
    return ", ".join("'" + value.replace("'", "''") + "'" for value in values)


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def upgrade() -> None:
    # Added nullable, backfilled, then tightened. There is no server_default that
    # could do this in one step: every row needs a *different* value, and it has
    # to be unique.
    op.add_column("users", sa.Column("friend_code", sa.String(length=16), nullable=True))

    bind = op.get_bind()
    user_ids = bind.execute(sa.text("SELECT id FROM users")).scalars().all()
    issued: set[str] = set()
    for user_id in user_ids:
        code = _generate_code()
        # At fifty bits this loop runs zero times; it is here because the unique
        # constraint added three lines below would otherwise be the thing that
        # discovered the collision, mid-migration, on somebody's production
        # database.
        while code in issued:
            code = _generate_code()
        issued.add(code)
        bind.execute(
            sa.text("UPDATE users SET friend_code = :code WHERE id = :id"),
            {"code": code, "id": user_id},
        )

    op.alter_column("users", "friend_code", existing_type=sa.String(length=16), nullable=False)
    op.create_unique_constraint("uq_users_friend_code", "users", ["friend_code"])

    op.create_table(
        "friendships",
        sa.Column("user_a_id", sa.Uuid(), nullable=False),
        sa.Column("user_b_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_a_id"],
            ["users.id"],
            name=op.f("fk_friendships_user_a_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_b_id"],
            ["users.id"],
            name=op.f("fk_friendships_user_b_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"],
            ["users.id"],
            name=op.f("fk_friendships_requested_by_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_a_id", "user_b_id", name=op.f("pk_friendships")),
        # Strict inequality, so this rules out a self-friendship as well as the
        # mirrored duplicate it exists for.
        sa.CheckConstraint("user_a_id < user_b_id", name=op.f("ck_friendships_ordered_pair")),
        sa.CheckConstraint(
            "requested_by_id IN (user_a_id, user_b_id)",
            name=op.f("ck_friendships_requester_is_a_party"),
        ),
        sa.CheckConstraint(
            f"status IN ({_quoted_list(STATUSES)})", name=op.f("ck_friendships_status")
        ),
    )
    # The primary key covers user_a_id; the trailing column needs its own index
    # or half of every "friendships involving me" query is a sequential scan.
    op.create_index("ix_friendships_user_b_id", "friendships", ["user_b_id"])


def downgrade() -> None:
    op.drop_index("ix_friendships_user_b_id", table_name="friendships")
    op.drop_table("friendships")
    op.drop_constraint("uq_users_friend_code", "users", type_="unique")
    op.drop_column("users", "friend_code")
