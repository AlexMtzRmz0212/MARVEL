from functools import lru_cache
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Kept as a module constant so the production guard can compare against it by
# identity of value rather than by repeating the literal.
DEV_SECRET_KEY = "dev-only-insecure-change-me-not-a-real-key-32b+"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["dev", "test", "prod"] = "dev"

    # postgresql+psycopg://  -- psycopg v3, not psycopg2.
    # On Vercel/Neon this must be the *pooled* (-pooler) host; see db/session.py.
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/mcu"

    # Signs the session cookie. The default is deliberately unusable in
    # production (see the validator below) but long enough that PyJWT does not
    # warn about key length on every token issued in dev. Generate a real one
    # with: python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: SecretStr = SecretStr(DEV_SECRET_KEY)
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

    @model_validator(mode="after")
    def _reject_default_secret_in_prod(self) -> Self:
        """Shipping the default key would let anyone mint a session cookie.

        Failing at startup is the right time to find out: the alternative is a
        deploy that looks healthy and is silently forgeable.
        """
        if self.environment == "prod" and self.secret_key.get_secret_value() == DEV_SECRET_KEY:
            raise ValueError("SECRET_KEY must be set to a real value when ENVIRONMENT=prod")
        return self

    @property
    def cookie_secure(self) -> bool:
        return self.environment == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
