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

from app.seed.schema import (
    EpisodesFile,
    SeedFile,
    SeedValidationError,
    ValidatedCatalog,
    validate_catalog,
)

DEFAULT_SEED_PATH = Path(__file__).parent / "data" / "mcu.json"


def _problems(exc: ValidationError, prefix: str = "") -> list[str]:
    problems = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"])
        problems.append(f"{prefix}{location}: {error['msg']}")
    return problems


def episodes_path_for(seed_path: Path) -> Path:
    """The generated episode lists live beside whichever seed file is read."""
    return seed_path.parent / "episodes.json"


def read_episodes_file(path: Path) -> EpisodesFile | None:
    """The episode lists, or None when there is no file (a test fixture, say)."""
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SeedValidationError([f"{path.name} is not valid JSON: {exc}"]) from exc
    try:
        return EpisodesFile.model_validate(raw)
    except ValidationError as exc:
        raise SeedValidationError(_problems(exc, f"{path.name}: ")) from exc


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
        raise SeedValidationError(_problems(exc)) from exc


def validate_document(raw: dict, path: Path = DEFAULT_SEED_PATH) -> ValidatedCatalog:
    """Validate a catalog that is already in memory, as the editor and the database hold it.

    Same two stages as the file path -- shape, then structure -- and the episode
    lists are still read from beside `path`, because they are generated files
    that ship with the code rather than part of the editable document.
    """
    try:
        seed = SeedFile.model_validate(raw)
    except ValidationError as exc:
        raise SeedValidationError(_problems(exc)) from exc
    return validate_catalog(seed, read_episodes_file(episodes_path_for(path)))


def load_and_validate(path: Path = DEFAULT_SEED_PATH) -> ValidatedCatalog:
    return validate_catalog(read_seed_file(path), read_episodes_file(episodes_path_for(path)))
