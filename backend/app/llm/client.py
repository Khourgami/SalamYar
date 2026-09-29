"""LLM-agnostic client interface (BACKEND_ARCHITECTURE §5)."""

from typing import Any, Literal, Protocol

from pydantic import BaseModel

OutputMode = Literal["json_schema", "json_object", "prompt_only"]
ReasoningEffort = Literal["minimal", "low", "medium", "high"]


class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMRequest(BaseModel):
    model: str
    messages: list[LLMMessage]
    temperature: float | None = None
    max_tokens: int = 4000
    reasoning_effort: ReasoningEffort | None = None
    json_schema: dict[str, Any] | None = None  # used only when output_mode == "json_schema"
    output_mode: OutputMode = "json_object"


class LLMResponse(BaseModel):
    text: str
    model_reported: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    reasoning_tokens: int | None
    cost_usd: float | None
    latency_ms: int
    raw: dict[str, Any]


class LLMError(Exception):
    """The LLM call failed after retries. The message is safe to store and show to admins."""


class LLMClient(Protocol):
    async def complete(self, req: LLMRequest) -> LLMResponse: ...
