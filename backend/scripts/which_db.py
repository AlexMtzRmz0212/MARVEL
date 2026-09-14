"""Which database is this connection string pointing at, and is it migrated?

This project talks to two Postgres databases that are easy to confuse: a dev one
named by `backend/.env`, and a production one named by Vercel's `DATABASE_URL`.
They are separate Neon projects with separate roles and separate passwords, and
Vercel stores its copy as a Sensitive variable, so the production value cannot be
read back from Vercel -- only from Neon. The failure mode that costs an afternoon
is running `alembic upgrade head` against the dev database, seeing it succeed,
and finding production still broken.

So: paste a connection string at the prompt and this says what it is. Nothing is
written and nothing is echoed -- the password never reaches the terminal, the
shell history or the output, and a connection failure is reported by exception
type only, because SQLAlchemy puts the whole URL into those messages.

Kept out of the deployed bundle by `.vercelignore`, like everything else here.

    cd backend
    .venv/Scripts/python.exe scripts/which_db.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

# The migration directory, resolved from this file rather than from the working
# directory. The usage line above says to run this from `backend`, but nothing
# enforces that, and reading head from the wrong place would fail quietly.
ALEMBIC_DIR = Path(__file__).resolve().parent.parent / "alembic"


def required_revision() -> str | None:
    """The head of the migration chain, read from the versions directory.

    This was a hand-maintained constant with a comment telling the next person to
    bump it, which is the version of this that does not work: the moment a
    migration lands without the bump, the script prints "up to date" about a
    database that is one revision behind. That false negative is the exact
    failure it exists to catch, so the value has to come from the chain itself.

    Returns None rather than raising when the chain cannot be read, because the
    host, the account count and the sentinel columns below are all still worth
    printing if this one line is unavailable.
    """
    try:
        heads = ScriptDirectory(str(ALEMBIC_DIR)).get_heads()
    except Exception:
        return None
    # A branched chain has more than one head and no single right answer. This
    # chain is linear, but saying so beats crashing if that ever stops being true.
    return heads[0] if len(heads) == 1 else None


# Columns whose absence pinpoints an un-applied migration, mapped to the revision
# that adds them. A missing column is a far more useful answer than a revision
# number, because it is what the 500 in the log will actually name.
SENTINEL_COLUMNS = {"friend_code": "0009_friendships"}


def normalise(url: str) -> str:
    """Neon hands out `postgresql://`, which SQLAlchemy reads as psycopg2.

    This project uses psycopg 3, so the driver has to be named explicitly or the
    connection dies with a ModuleNotFoundError about psycopg2 that says nothing
    about the real problem. Worth knowing that `DATABASE_URL` needs the same
    treatment wherever it is set, Vercel included.
    """
    url = url.strip().strip('"').strip("'")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def describe(url: str) -> None:
    host = re.search(r"@([^/]+)/", url)
    engine = create_engine(url, connect_args={"connect_timeout": 15})
    try:
        with engine.connect() as conn:
            database = conn.execute(text("select current_database()")).scalar()
            columns = set(
                conn.execute(
                    text(
                        "select column_name from information_schema.columns "
                        "where table_schema='public' and table_name='users'"
                    )
                )
                .scalars()
                .all()
            )
            try:
                revision = conn.execute(text("select version_num from alembic_version")).scalar()
            except Exception:
                revision = None
            accounts = (
                conn.execute(text("select count(*) from public.users")).scalar() if columns else 0
            )
    finally:
        engine.dispose()

    print()
    print(f"  host           : {host.group(1) if host else '?'}")
    print(f"  database       : {database}")
    print(f"  alembic version: {revision or '(no alembic_version table)'}")
    print(f"  accounts       : {accounts}")
    for column, revision_adding in SENTINEL_COLUMNS.items():
        state = "present" if column in columns else f"MISSING (needs {revision_adding})"
        print(f"  users.{column:<9}: {state}")
    print()

    required = required_revision()

    if not columns:
        print("  >> No users table here at all. Wrong database name in the URL.")
    elif missing := [column for column in SENTINEL_COLUMNS if column not in columns]:
        print(f"  >> NOT MIGRATED. Missing: {', '.join(missing)}.")
        print(f"     Run `alembic upgrade head` against this one ({accounts} account(s) on it).")
    elif required is None:
        print(f"  >> Sentinel columns are present and alembic says {revision!r}.")
        print(f"     Could not read head from {ALEMBIC_DIR}, so that is unverified.")
    elif revision != required:
        print(f"  >> Columns are present but alembic says {revision!r}, not {required!r}.")
        print(f"     Run `alembic upgrade head` against this one ({accounts} account(s) on it).")
    else:
        print(f"  >> Up to date at {required}. Nothing to do for this database.")


def main() -> int:
    print("Paste a connection string (not echoed, not stored), then press Enter.")
    try:
        url = input("> ")
    except (EOFError, KeyboardInterrupt):
        return 1
    if not url.strip():
        print("Nothing pasted.")
        return 1

    try:
        describe(normalise(url))
    except Exception as exc:
        # Deliberately not printing the exception: SQLAlchemy and psycopg both
        # include the full URL, password and all, in connection errors.
        print(f"\n  Could not connect: {type(exc).__name__}")
        print("  Check the host, the database name and the password, then try again.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
