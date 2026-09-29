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

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not _SLUG.match(v):
            raise ValueError("id must be a lowercase slug (a-z, 0-9, '-')")
        return v

    @property
    def effective_temperature(self) -> float | None:
        return self.temperature if self.send_temperature else None
