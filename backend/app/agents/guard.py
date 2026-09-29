"""Deterministic guard G1–G5 (BACKEND_ARCHITECTURE §6.4)."""

from app.agents.clinical_schemas import (
    AssessmentResult,
    GuardAction,
    GuardFlag,
    GuardReport,
    TriageLevel,
)
from app.agents.config import AgentOptions
from app.agents.texts_fa import DISCLAIMER_FA, EMERGENCY_TEMPLATE_FA

CONSISTENCY_THRESHOLD = 0.10
MAX_DIFFERENTIAL = 5
_NON_URGENT = {TriageLevel.SELF_CARE, TriageLevel.ROUTINE_DAYS}
_EPSILON = 1e-9


def apply_guard(
    result: AssessmentResult, options: AgentOptions
) -> tuple[AssessmentResult, GuardReport, str]:
    """Return the final assessment, the guard report, and the final patient-facing text."""
    final = result.model_copy(deep=True)
    actions: list[GuardAction] = []
    flags: list[GuardFlag] = []
    p = final.emergency_probability

    # G1 — safety floor
    escalated = (
        options.safety_floor
        and p >= options.emergency_threshold
        and final.triage_level != TriageLevel.EMERGENCY_NOW
    )
    if escalated:
        final.triage_level = TriageLevel.EMERGENCY_NOW
        final.patient_message = EMERGENCY_TEMPLATE_FA
        actions.append("safety_floor_escalation")

    # G2 — consistency flags (evaluated on the level after G1; nothing is changed)
    if final.triage_level == TriageLevel.EMERGENCY_NOW and p < CONSISTENCY_THRESHOLD:
        flags.append("low_prob_emergency")
    elif final.triage_level in _NON_URGENT and p >= CONSISTENCY_THRESHOLD:
        flags.append("high_prob_nonurgent")

    # G3 — differential: sorted by probability, at most 5, normalized if the sum exceeds 1
    ddx = sorted(final.differential, key=lambda h: h.probability, reverse=True)[:MAX_DIFFERENTIAL]
    total = sum(h.probability for h in ddx)
    if total > 1.0 + _EPSILON:
        ddx = [h.model_copy(update={"probability": h.probability / total}) for h in ddx]
        flags.append("ddx_normalized")
    final.differential = ddx

    # G4 — specialty codes outside the closed list were mapped before validation
    if result.specialty_invalid:
        flags.append("specialty_invalid")

    report = GuardReport(
        raw_triage_level=result.triage_level,
        final_triage_level=final.triage_level,
        actions=actions,
        flags=flags,
    )

    # G5 — disclaimer, always
    body = EMERGENCY_TEMPLATE_FA if escalated else final.patient_message
    return final, report, f"{body}\n\n{DISCLAIMER_FA}"
