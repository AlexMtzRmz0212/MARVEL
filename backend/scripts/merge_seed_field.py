"""Copy one field from the bundled `mcu.json` into the *stored* catalog.

The live catalog is the document in the database, not the file: the file is only
imported the first time. So a field added to the file (like `in_universe_date`)
never reaches a database that already has a document. This copies it across, for
titles that do not already have a value there -- edits made in the editor win.

It goes through `save_document`, so it validates, keeps the old document in the
history ("Earlier versions" in the editor undoes it) and publishes at once.

    cd backend
    .venv/Scripts/python.exe scripts/merge_seed_field.py in_universe_date          # dry run
    .venv/Scripts/python.exe scripts/merge_seed_field.py in_universe_date --apply  # write

Which database is the one in `backend/.env`; check with `scripts/which_db.py`.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import SessionLocal  # noqa: E402
from app.seed.reader import DEFAULT_SEED_PATH  # noqa: E402
from app.services import catalog_store  # noqa: E402


def main(argv: list[str]) -> int:
    fields = [arg for arg in argv if not arg.startswith("--")]
    apply = "--apply" in argv
    if len(fields) != 1:
        print(__doc__)
        return 2
    field = fields[0]

    bundled = json.loads(DEFAULT_SEED_PATH.read_text(encoding="utf-8"))
    wanted = {m["id"]: m[field] for m in bundled["movies"] if m.get(field) is not None}

    with SessionLocal() as session:
        stored = catalog_store.ensure_document(session)
        document = copy.deepcopy(stored.document)

        changed = []
        for movie in document["movies"]:
            if movie.get(field) is None and movie["id"] in wanted:
                movie[field] = wanted[movie["id"]]
                changed.append(movie["id"])

        print(f"{len(changed)} title(s) would get `{field}`; the rest already have one or have none.")
        if not changed:
            return 0
        if not apply:
            print("Dry run. Add --apply to write it.")
            return 0

        saved = catalog_store.save_document(session, document, stored.revision)
        print(f"Saved. Revision {saved.revision}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
