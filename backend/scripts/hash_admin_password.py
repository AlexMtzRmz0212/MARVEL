"""Print the hash to store as ADMIN_PASSWORD_HASH.

    cd backend
    .venv/Scripts/python.exe scripts/hash_admin_password.py

Prompts for the password (nothing is echoed) and prints an argon2 hash. Put that
in the Vercel project's environment variables -- and in backend/.env if you want
the sign-in locally too; without it the editor is simply open in dev. Only the
hash is stored anywhere, so a leaked environment does not leak the password.
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path

# Run as a script, `app` is only importable if the package was installed.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password  # noqa: E402  (path set above)


def main() -> int:
    password = getpass.getpass("Editor password: ")
    if len(password) < 12:
        print("Use at least 12 characters: this is the only thing guarding the catalog.")
        return 1
    if getpass.getpass("Again: ") != password:
        print("Those do not match.")
        return 1

    print()
    print("ADMIN_PASSWORD_HASH='" + hash_password(password) + "'")
    print()
    print("Keep the single quotes in a .env file (the hash contains $). In Vercel's")
    print("dashboard, paste only what is between them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
