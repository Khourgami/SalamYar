"""Environment settings (BACKEND_ARCHITECTURE §13), loaded from `.env`."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openrouter_api_key: SecretStr
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    app_public_url: str = "http://localhost:5173"
    jwt_secret: SecretStr
    jwt_expires_hours: int = 12
    cors_origins: str = "http://localhost:5173"
    database_path: str = "data/lab.db"
    agents_config_path: str = "config/agents.yaml"
    llm_timeout_seconds: float = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
