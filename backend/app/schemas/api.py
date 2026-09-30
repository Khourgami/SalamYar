"""API schemas mirroring API_CONTRACT §2–§7 exactly (field names and nullability)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.agents.clinical_schemas import AssessmentResult, GuardReport, Specialty, TriageLevel
from app.schemas.common import UserOut

SessionStatus = Literal["active", "completed"]
EndReason = Literal["agent_concluded", "max_questions", "evaluator_ended"]
MessageKind = Literal["greeting", "question", "result", "error", "text"]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- agents --------------------------------------------------------------------------------


class AgentPublic(ApiModel):
    id: str
    display_name: str
    description: str | None


class AgentRevealConfig(ApiModel):
    max_questions: int
    safety_floor: bool
    emergency_threshold: float
    reasoning_effort: str | None
    temperature: float | None
    prompt_version: str


class AgentReveal(ApiModel):
    architecture: Literal["simple", "structured"]
    model: str
    config: AgentRevealConfig


# --- messages & results --------------------------------------------------------------------


class MessageOut(ApiModel):
    id: str
    seq: int
    role: Literal["agent", "patient"]
    kind: MessageKind
    text: str
    created_at: datetime
    latency_ms: int | None


class ResultStats(ApiModel):
    questions_asked: int
    duration_seconds: float
    mean_turn_latency_ms: float | None
    # v1.2: null for a non-admin caller until the session is evaluated (D-035)
    total_cost_usd: float | None
    llm_calls: int | None
    prompt_tokens: int | None
    completion_tokens: int | None
    reasoning_tokens: int | None


class ResultCard(ApiModel):
    assessment: AssessmentResult
    guard: GuardReport
    stats: ResultStats


class FeedbackOut(ApiModel):
    message_id: str
    rating: Literal["up", "down"]
    note: str | None
    updated_at: datetime


# --- evaluation ----------------------------------------------------------------------------


class Scores(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triage_correctness: int = Field(ge=1, le=5, strict=True)
    referral_appropriateness: int = Field(ge=1, le=5, strict=True)
    efficiency: int = Field(ge=1, le=5, strict=True)
    question_quality: int = Field(ge=1, le=5, strict=True)
    history_completeness: int = Field(ge=1, le=5, strict=True)
    clinical_reasoning: int = Field(ge=1, le=5, strict=True)
    communication: int = Field(ge=1, le=5, strict=True)
    summary_usefulness: int = Field(ge=1, le=5, strict=True)
    overall_trust: int = Field(ge=1, le=5, strict=True)


class SafetyFlags(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dangerous_undertriage: bool = Field(strict=True)
    medication_or_treatment_advice: bool = Field(strict=True)
    definitive_diagnosis_claim: bool = Field(strict=True)
    medically_incorrect_information: bool = Field(strict=True)
    irrelevant_or_inappropriate_content: bool = Field(strict=True)


class DoctorVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triage_level: TriageLevel
    specialty: Specialty
    main_diagnosis: str | None


class Comments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strengths: str | None
    weaknesses: str | None
    missed_questions: str | None
    general: str | None


class Comparison(BaseModel):
    model_config = ConfigDict(extra="forbid")

    compared_session_id: str
    winner: Literal["this", "other", "tie"]


class EvaluationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scores: Scores
    unnecessary_questions_count: int | None = Field(ge=0, le=50, strict=True)
    safety_flags: SafetyFlags
    doctor_verdict: DoctorVerdict
    comments: Comments
    comparison: Comparison | None


class EvaluationOut(EvaluationInput):
    model_config = ConfigDict(extra="ignore")

    id: str
    session_id: str
    created_at: datetime


# --- sessions ------------------------------------------------------------------------------


class SessionSummary(ApiModel):
    id: str
    agent: AgentPublic
    status: SessionStatus
    end_reason: EndReason | None
    questions_asked: int
    created_at: datetime
    completed_at: datetime | None
    evaluated: bool
    first_patient_message: str | None
    final_triage_level: TriageLevel | None


class SessionDetail(SessionSummary):
    messages: list[MessageOut]
    result: ResultCard | None
    backstage: list[dict[str, Any]] | None
    feedback: list[FeedbackOut]
    evaluation: EvaluationOut | None
    reveal: AgentReveal | None


class SessionList(BaseModel):
    items: list[SessionSummary]
    total: int


class AdminSessionSummary(SessionSummary):
    user: UserOut
    agent_reveal: AgentReveal


class AdminSessionList(BaseModel):
    items: list[AdminSessionSummary]
    total: int


class TurnResponse(BaseModel):
    patient_message: MessageOut | None
    agent_message: MessageOut
    session: SessionDetail


# --- requests ------------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    agent_id: str


class PostMessageRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def _trim(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 2000:
            raise ValueError("text must be 1-2000 characters after trimming")
        return v


class FeedbackRequest(BaseModel):
    rating: Literal["up", "down"]
    note: str | None = Field(default=None, max_length=1000)


class ReloadResponse(BaseModel):
    loaded: int
    enabled: int
