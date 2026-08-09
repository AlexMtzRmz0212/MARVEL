"""Initial schema: catalog, prerequisite DAG, users, custom orders, progress

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-06
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "movies",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("release_date", sa.Date(), nullable=False),
        sa.Column("phase", sa.Integer(), nullable=True),
        sa.Column("saga", sa.String(length=32), nullable=False),
        sa.Column("universe", sa.String(length=24), nullable=False),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("tier", sa.String(length=16), nullable=False),
        sa.Column("runtime_min", sa.Integer(), nullable=True),
        sa.Column("poster_url", sa.String(length=500), nullable=True),
        sa.Column("synopsis", sa.Text(), nullable=True),
        sa.Column("release_order", sa.Integer(), nullable=False),
        sa.Column("chrono_order", sa.Integer(), nullable=True),
        sa.Column("tmdb_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "media_type IN ('film', 'series', 'special')", name=op.f("ck_movies_media_type")
        ),
        sa.CheckConstraint(
            "saga IN ('infinity', 'multiverse', 'none')", name=op.f("ck_movies_saga")
        ),
        sa.CheckConstraint(
            "tier IN ('core', 'supporting', 'optional', 'adjacent')", name=op.f("ck_movies_tier")
        ),
        sa.CheckConstraint(
            "universe IN ('mcu', 'sony', 'fox', 'netflix', 'abc')", name=op.f("ck_movies_universe")
        ),
        sa.CheckConstraint(
            "chrono_order IS NULL OR chrono_order >= 0",
            name=op.f("ck_movies_chrono_order_non_negative"),
        ),
        sa.CheckConstraint(
            "phase IS NULL OR (phase BETWEEN 1 AND 10)", name=op.f("ck_movies_phase_range")
        ),
        sa.CheckConstraint(
            "release_order >= 0", name=op.f("ck_movies_release_order_non_negative")
        ),
        sa.CheckConstraint(
            "runtime_min IS NULL OR runtime_min > 0", name=op.f("ck_movies_runtime_positive")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movies")),
        # Deferrable so the seed loader can renumber the whole catalog inside a
        # single transaction without tripping over intermediate collisions.
        sa.UniqueConstraint(
            "chrono_order",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_movies_chrono_order"),
        ),
        sa.UniqueConstraint(
            "release_order",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_movies_release_order"),
        ),
        sa.UniqueConstraint("tmdb_id", name=op.f("uq_movies_tmdb_id")),
    )
    op.create_index(op.f("ix_movies_release_date"), "movies", ["release_date"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )

    op.create_table(
        "prerequisites",
        sa.Column("movie_id", sa.String(length=80), nullable=False),
        sa.Column("prerequisite_id", sa.String(length=80), nullable=False),
        sa.Column("strength", sa.String(length=16), server_default="essential", nullable=False),
        sa.Column("note", sa.String(length=280), nullable=True),
        sa.CheckConstraint(
            "strength IN ('essential', 'recommended')", name=op.f("ck_prerequisites_strength")
        ),
        sa.CheckConstraint(
            "movie_id <> prerequisite_id", name=op.f("ck_prerequisites_no_self_loop")
        ),
        sa.ForeignKeyConstraint(
            ["movie_id"],
            ["movies.id"],
            name=op.f("fk_prerequisites_movie_id_movies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["prerequisite_id"],
            ["movies.id"],
            name=op.f("fk_prerequisites_prerequisite_id_movies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("movie_id", "prerequisite_id", name=op.f("pk_prerequisites")),
    )
    # The composite primary key already indexes forward traversal; this covers
    # reverse traversal, which Kahn's algorithm needs on every sort.
    op.create_index(
        "ix_prerequisites_prerequisite_id", "prerequisites", ["prerequisite_id"], unique=False
    )

    op.create_table(
        "custom_orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_custom_orders_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_custom_orders")),
        sa.UniqueConstraint("user_id", "name", name=op.f("uq_custom_orders_user_id_name")),
    )
    op.create_index(op.f("ix_custom_orders_user_id"), "custom_orders", ["user_id"], unique=False)

    op.create_table(
        "custom_order_items",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("movie_id", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "position >= 0", name=op.f("ck_custom_order_items_position_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["movie_id"],
            ["movies.id"],
            name=op.f("fk_custom_order_items_movie_id_movies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["custom_orders.id"],
            name=op.f("fk_custom_order_items_order_id_custom_orders"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("order_id", "movie_id", name=op.f("pk_custom_order_items")),
        # Deferrable because saving a drag-and-drop reorder renumbers many rows
        # at once and the intermediate states legitimately collide.
        sa.UniqueConstraint(
            "order_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_custom_order_items_order_id_position"),
        ),
    )

    op.create_table(
        "watch_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("movie_id", sa.String(length=80), nullable=False),
        sa.Column("watched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 10", name=op.f("ck_watch_progress_rating_range")
        ),
        sa.ForeignKeyConstraint(
            ["movie_id"],
            ["movies.id"],
            name=op.f("fk_watch_progress_movie_id_movies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_watch_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "movie_id", name=op.f("pk_watch_progress")),
    )


def downgrade() -> None:
    op.drop_table("watch_progress")
    op.drop_table("custom_order_items")
    op.drop_index(op.f("ix_custom_orders_user_id"), table_name="custom_orders")
    op.drop_table("custom_orders")
    op.drop_index("ix_prerequisites_prerequisite_id", table_name="prerequisites")
    op.drop_table("prerequisites")
    op.drop_table("users")
    op.drop_index(op.f("ix_movies_release_date"), table_name="movies")
    op.drop_table("movies")
