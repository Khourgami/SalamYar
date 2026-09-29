"""Clinical schemas and enums (AGENT_SPEC §2–§3). Field names are exact."""

from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    Field,
    ModelWrapValidatorHandler,
    PrivateAttr,
    model_validator,
)

Probability = Annotated[float, Field(ge=0, le=1)]


class TriageLevel(StrEnum):
    EMERGENCY_NOW = "EMERGENCY_NOW"
    URGENT_24H = "URGENT_24H"
    ROUTINE_DAYS = "ROUTINE_DAYS"
    SELF_CARE = "SELF_CARE"
    INSUFFICIENT_INFO = "INSUFFICIENT_INFO"


class Specialty(StrEnum):
    general_practice = "general_practice"
    emergency_medicine = "emergency_medicine"
    internal_medicine = "internal_medicine"
    cardiology = "cardiology"
    gastroenterology = "gastroenterology"
    pulmonology = "pulmonology"
    neurology = "neurology"
    infectious_disease = "infectious_disease"
    nephrology = "nephrology"
    urology = "urology"
    obstetrics_gynecology = "obstetrics_gynecology"
    general_surgery = "general_surgery"
    orthopedics = "orthopedics"
    dermatology = "dermatology"
    ent = "ent"
    ophthalmology = "ophthalmology"
    psychiatry = "psychiatry"
    endocrinology = "endocrinology"
    rheumatology = "rheumatology"
    hematology_oncology = "hematology_oncology"
    pediatrics = "pediatrics"


SPECIALTY_CODES = frozenset(s.value for s in Specialty)
SPECIALTY_FIELDS = ("specialty_primary", "specialty_secondary")


class SymptomDetail(BaseModel):
    name: str
    onset: str | None = None
    duration: str | None = None
    location: str | None = None
    character: str | None = None
    severity_0_10: int | None = None
    timing_pattern: str | None = None
    aggravating: list[str] = []
    relieving: list[str] = []


class ClinicalState(BaseModel):
    age_years: int | None = None
    sex: Literal["female", "male"] | None = None
    pregnancy_possible: Literal["yes", "no", "unknown", "not_applicable"] | None = None
    chief_complaint: str | None = None
    symptoms: list[SymptomDetail] = []
    associated_symptoms: list[str] = []
    pertinent_negatives: list[str] = []
    medical_history: list[str] = []
    medications: list[str] = []
    allergies: list[str] = []
    other_relevant: list[str] = []
    contradictions: list[str] = []


class Hypothesis(BaseModel):
    name_fa: str
    name_en: str
    probability: Probability
    supporting: list[str] = []
    against: list[str] = []


class CantMiss(BaseModel):
    name_fa: str
    name_en: str
    status: Literal["not_yet_assessed", "ruled_out", "not_excluded", "suspected"]
    reason: str


class TurnDecision(BaseModel):
    clinical_state: ClinicalState
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=5)
    cant_miss: list[CantMiss] = Field(max_length=6)
    emergency_probability: Probability
    next_action: Literal["ask", "clarify", "conclude"]
    stop_reason: Literal["enough_information", "emergency_detected", "out_of_scope"] | None
    question_rationale: str
    message_to_patient: str

    @model_validator(mode="after")
    def _message_when_asking(self) -> Self:
        if self.next_action in ("ask", "clarify"):
            if not self.message_to_patient.strip():
                raise ValueError(
                    "message_to_patient must be non-empty when next_action is ask/clarify"
                )
        else:
            # D-024: any text on conclude is accepted and discarded (never shown or stored).
            self.message_to_patient = ""
        return self


class ClinicalSummary(BaseModel):
    chief_complaint: str
    history_of_present_illness: str
    relevant_history: str
    medications: str
    allergies: str
    pertinent_negatives: str
    assessment_rationale: str


class AssessmentResult(BaseModel):
    triage_level: TriageLevel
    emergency_probability: Probability
    specialty_primary: Specialty
    specialty_secondary: Specialty | None
    differential: list[Hypothesis] = Field(min_length=1, max_length=5)
    cant_miss: list[CantMiss]
    missing_information: list[str]
    confidence: Literal["low", "medium", "high"]
    out_of_scope_pediatric: bool = False
    patient_message: str
    clinical_summary: ClinicalSummary

    # Set by the pre-validation hook when a raw specialty code was outside the closed list
    # (guard rule G4 reports it as flag `specialty_invalid`). Not part of the serialized output.
    _specialty_invalid: bool = PrivateAttr(default=False)

    @property
    def specialty_invalid(self) -> bool:
        return self._specialty_invalid

    @model_validator(mode="wrap")
    @classmethod
    def _map_unknown_specialties(cls, data: Any, handler: ModelWrapValidatorHandler[Self]) -> Self:
        mapped, invalid = map_unknown_specialties(data)
        result = handler(mapped)
        if invalid:
            result._specialty_invalid = True
        return result


def map_unknown_specialties(data: Any) -> tuple[Any, bool]:
    """G4 pre-validation hook on raw data: unknown specialty codes → `general_practice`.

    Only `specialty_primary` (any non-code value) and `specialty_secondary` (any non-null
    non-code value) are touched. Returns the (possibly copied) data and whether anything changed.
    """
    if not isinstance(data, dict):
        return data, False
    invalid = False
    out = dict(data)
    for key in SPECIALTY_FIELDS:
        if key not in out:
            continue
        value = out[key]
        if key == "specialty_secondary" and value is None:
            continue
        if not isinstance(value, str) or value not in SPECIALTY_CODES:
            out[key] = Specialty.general_practice.value
            invalid = True
    return out, invalid


class SimpleTurn(BaseModel):
    action: Literal["ask", "conclude"]
    message_to_patient: str
    reasoning_note: str
    assessment: AssessmentResult | None

    @model_validator(mode="after")
    def _check_action(self) -> Self:
        if self.action == "conclude" and self.assessment is None:
            raise ValueError('assessment is required when action is "conclude"')
        if self.action == "ask" and self.assessment is not None:
            raise ValueError('assessment must be null when action is "ask"')
        if self.action == "ask" and not self.message_to_patient.strip():
            raise ValueError('message_to_patient must be non-empty when action is "ask"')
        return self


GuardAction = Literal["safety_floor_escalation"]
GuardFlag = Literal[
    "low_prob_emergency", "high_prob_nonurgent", "ddx_normalized", "specialty_invalid"
]


class GuardReport(BaseModel):
    raw_triage_level: TriageLevel
    final_triage_level: TriageLevel
    actions: list[GuardAction] = []
    flags: list[GuardFlag] = []
