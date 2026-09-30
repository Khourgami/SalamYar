"""Agent configuration models (BACKEND_ARCHITECTURE §8, AGENT_SPEC §9)."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.llm.client import OutputMode, ReasoningEffort

Architecture = Literal["simple", "structured"]
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class AgentOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_questions: int = Field(default=12, ge=1)
    safety_floor: bool = True
    emergency_threshold: float = Field(default=0.20, ge=0, le=1)


class ModelPricing(BaseModel):
    """USD per 1M tokens for one model slug (BACKEND_ARCHITECTURE §8a, D-035)."""

    model_config = ConfigDict(extra="forbid")

    input_per_mtok: float = Field(ge=0)
    output_per_mtok: float = Field(ge=0)
    # D-042: price of prompt tokens read from the provider's cache; optional (not every model)
    input_cache_read_per_mtok: float | None = Field(default=None, ge=0)
    source: str = Field(min_length=1)
    as_of: str = Field(min_length=1)

    def estimate(
        self,
        prompt_tokens: int | None,
        output_tokens: int | None,
        cached_prompt_tokens: int | None = None,
    ) -> float | None:
        """`((prompt − cached) × input + cached × cache_read + output × output) / 1e6`; without a
        cache price or cached tokens this is `(prompt × input + output × output) / 1e6`. None
        when usage is missing."""
        if prompt_tokens is None or output_tokens is None:
            return None
        cached = 0
        if cached_prompt_tokens and self.input_cache_read_per_mtok is not None:
            cached = min(cached_prompt_tokens, prompt_tokens)
        return (
            (prompt_tokens - cached) * self.input_per_mtok
            + cached * (self.input_cache_read_per_mtok or 0.0)
            + output_tokens * self.output_per_mtok
        ) / 1e6


class AgentConfig(BaseModel):
    """One agent, with the `defaults` block already merged in."""

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str = Field(min_length=1)
    description: str | None = None
    architecture: Architecture
    model: str = Field(min_length=1)
    enabled: bool = True
    temperature: float | None = 0.3
    send_temperature: bool = True
    reasoning_effort: ReasoningEffort | None = "low"
    max_tokens: int = Field(default=4000, ge=1)
    output_mode: OutputMode = "json_object"
    prompt_version: str = "v1"
    options: AgentOptions = AgentOptions()
    # Filled by the registry from the top-level `pricing` map (never set per agent), so the
    # session snapshot keeps the price that was current when the session started. None only in
    # snapshots written before v1.2.
    pricing: ModelPricing | None = None
    # Filled by the registry from the top-level `provider_order` map (D-041, open-weight models
    # only); part of the session snapshot. None = OpenRouter's default routing.
    provider_order: list[str] | None = None

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not _SLUG.match(v):
            raise ValueError("id must be a lowercase slug (a-z, 0-9, '-')")
        return v

    @property
    def effective_temperature(self) -> float | None:
        return self.temperature if self.send_temperature else None
