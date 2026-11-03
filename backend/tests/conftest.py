"""Settings the whole suite shares.

ENVIRONMENT=test is set before anything imports the app, because `get_settings`
is cached and `backend/.env` points at a real Neon branch. In `test` the public
catalog is served from the bundled file and never opens a connection (see
`app.catalog._database_enabled`), and the editor is switched off unless a test
gives it a password.
"""

from __future__ import annotations

import os

os.environ["ENVIRONMENT"] = "test"
# Blank, not absent: an empty value beats whatever backend/.env says.
os.environ["ADMIN_PASSWORD_HASH"] = ""
