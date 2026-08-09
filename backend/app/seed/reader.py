"""Read and validate the curated catalog file.

Split out from `loader.py` on purpose. The loader also writes to Postgres, so it
imports SQLAlchemy and the ORM models; the running API needs none of that -- it
only reads this JSON at startup. Keeping the read path in its own module means
the deployed serverless function installs FastAPI and pydantic and nothing else.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from app.seed.schema import SeedFile, SeedValidationError, ValidatedCatalog, validate_catalog

DEFAULT_SEED_PATH = Path(__file__).parent / "data" / "mcu.json"


def read_seed_file(path: Path = DEFAULT_SEED_PATH) -> SeedFile:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SeedValidationError([f"Seed file not found: {path}"]) from exc
    except json.JSONDecodeError as exc:
        raise SeedValidationError([f"{path.name} is not valid JSON: {exc}"]) from exc

    try:
        return SeedFile.model_validate(raw)
    except ValidationError as exc:
        problems = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error["loc"])
            problems.append(f"{location}: {error['msg']}")
        raise SeedValidationError(problems) from exc


def load_and_validate(path: Path = DEFAULT_SEED_PATH) -> ValidatedCatalog:
    return validate_catalog(read_seed_file(path))
