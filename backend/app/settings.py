"""Environment settings (BACKEND_ARCHITECTURE §13), loaded from `.env`."""

from functools import lru_cache
from typing import TYPE_CHECKING

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from app.llm.budget import TurnBudget


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
    llm_timeout_seconds: float = 60  # httpx per-read timeout
    llm_call_deadline_seconds: float = 50  # total deadline per LLM call (D-038)
    turn_deadline_seconds: float = 80  # total deadline per turn, all calls included (D-038)

    def new_turn_budget(self) -> "TurnBudget":
        from app.llm.budget import TurnBudget

        return TurnBudget(self.turn_deadline_seconds, self.llm_call_deadline_seconds)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
