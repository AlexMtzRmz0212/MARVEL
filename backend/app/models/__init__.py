"""Importing this package registers every table on `Base.metadata`.

Alembic's env.py imports it for exactly that reason -- autogenerate can only see
models that have actually been imported.
"""

from app.models.admin_attempt import AdminAttempt
from app.models.catalog_document import CatalogDocument, CatalogHistory
from app.models.custom_order import CustomOrder, CustomOrderItem
from app.models.friendship import Friendship
from app.models.movie import Movie, Prerequisite
from app.models.user import User
from app.models.watch_progress import WatchProgress

__all__ = [
    "AdminAttempt",
    "CatalogDocument",
    "CatalogHistory",
    "CustomOrder",
    "CustomOrderItem",
    "Friendship",
    "Movie",
    "Prerequisite",
    "User",
    "WatchProgress",
]
