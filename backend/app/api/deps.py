from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.catalog import Catalog, get_catalog

# The read-only half of the API needs no database: the catalog is the same for
# everybody and is loaded from the curated JSON file at startup. A database
# session dependency arrives alongside authentication, when there is finally
# per-user data (accounts, saved orders, watch progress) to store.
CatalogDep = Annotated[Catalog, Depends(get_catalog)]
