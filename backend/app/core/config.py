from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["dev", "test", "prod"] = "dev"

    # postgresql+psycopg://  -- psycopg v3, not psycopg2.
    # On Vercel/Neon this must be the *pooled* (-pooler) host; see db/session.py.
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/mcu"

    secret_key: SecretStr = SecretStr("dev-only-insecure-change-me")
    access_token_expire_minutes: int = 60 * 24 * 7

    # Only needed in dev, where Vite serves the SPA on a different port than uvicorn.
    # In production the SPA and the API share an origin, so the browser never
    # issues a cross-origin request and this list stays empty.
    #
    # NoDecode is required: without it pydantic-settings tries to JSON-decode
    # any complex-typed value coming from a .env file *before* validators run,
    # so a plain comma-separated string fails to parse before this validator
    # ever sees it.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def cookie_secure(self) -> bool:
        return self.environment == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
