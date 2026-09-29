"""Shared FastAPI dependencies: the LLM client (tests override with FakeLLM)."""

from functools import lru_cache

from app.llm.client import LLMClient
from app.llm.openrouter import OpenRouterClient
from app.settings import get_settings


@lru_cache
def _openrouter() -> OpenRouterClient:
    s = get_settings()
    return OpenRouterClient(
        api_key=s.openrouter_api_key.get_secret_value(),
        base_url=s.openrouter_base_url,
        referer=s.app_public_url,
        timeout_seconds=s.llm_timeout_seconds,
    )


def get_llm() -> LLMClient:
    return _openrouter()
