"""Importing this package registers every table on `Base.metadata`.

Alembic's env.py imports it for exactly that reason -- autogenerate can only see
models that have actually been imported.
"""

from app.models.custom_order import CustomOrder, CustomOrderItem
from app.models.movie import Movie, Prerequisite
from app.models.user import User
from app.models.watch_progress import WatchProgress

__all__ = [
    "CustomOrder",
    "CustomOrderItem",
    "Movie",
    "Prerequisite",
    "User",
    "WatchProgress",
]
