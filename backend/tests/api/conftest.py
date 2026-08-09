"""Fixtures for API tests.

No database. The read-only API serves the catalog from the curated JSON file,
so these are genuine end-to-end tests of the real app with nothing stubbed --
they just happen to need no infrastructure to run.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
