"""Architecture protocol, session context and turn outcome (BACKEND_ARCHITECTURE §5)."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from pydantic import BaseModel

from app.agents.clinical_schemas import AssessmentResult, ClinicalState, GuardReport, Hypothesis
from app.agents.config import AgentConfig
from app.agents.json_runner import TraceFn
from app.llm.budget import TurnBudget
from app.llm.client import LLMMessage, LLMRequest

EndReason = Literal["agent_concluded", "max_questions", "evaluator_ended"]


class TranscriptEntry(BaseModel):
    role: Literal["patient", "agent"]
    text: str


def build_transcript(messages: Iterable[tuple[str, str, str]]) -> list[TranscriptEntry]:
    """(role, kind, text) triples in order → transcript without `error` messages."""
    return [
        TranscriptEntry(role=role, text=text)  # type: ignore[arg-type]
        for role, kind, text in messages
        if kind != "error"
    ]


@dataclass
class SessionContext:
    config: AgentConfig
    transcript: list[TranscriptEntry]
    trace: TraceFn
    questions_asked: int = 0
    clinical_state: ClinicalState | None = None  # architecture B only
    previous_hypotheses: list[Hypothesis] = field(default_factory=list)  # architecture B only
    save_clinical_state: Callable[[ClinicalState], None] = lambda _state: None
    # D-038: one budget per next_turn/force_conclude; the session service sets a fresh one
    budget: TurnBudget = field(default_factory=TurnBudget)


class TurnOutcome(BaseModel):
    kind: Literal["question", "result"]
    agent_message: str  # Persian text shown to the patient
    backstage: dict[str, Any]  # per-turn reasoning to persist (architecture-specific)
    assessment: AssessmentResult | None = None  # final (guarded), iff kind == "result"
    raw_assessment: AssessmentResult | None = None  # pre-guard, iff kind == "result"
    guard_report: GuardReport | None = None


class Architecture(Protocol):
    name: str

    async def next_turn(self, ctx: SessionContext) -> TurnOutcome: ...

    async def force_conclude(self, ctx: SessionContext, end_reason: EndReason) -> TurnOutcome: ...


def make_request(
    config: AgentConfig, messages: list[LLMMessage], schema_model: type[BaseModel]
) -> LLMRequest:
    return LLMRequest(
        model=config.model,
        messages=messages,
        temperature=config.effective_temperature,
        max_tokens=config.max_tokens,
        reasoning_effort=config.reasoning_effort,
        output_mode=config.output_mode,
        json_schema=(
            {"name": schema_model.__name__, "schema": schema_model.model_json_schema()}
            if config.output_mode == "json_schema"
            else None
        ),
    )
