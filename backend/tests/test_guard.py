import pytest

from app.agents.clinical_schemas import AssessmentResult, Hypothesis, TriageLevel
from app.agents.config import AgentOptions
from app.agents.guard import apply_guard
from app.agents.texts_fa import DISCLAIMER_FA, EMERGENCY_TEMPLATE_FA
from tests import fixtures as fx

ON = AgentOptions(safety_floor=True, emergency_threshold=0.20)
OFF = AgentOptions(safety_floor=False, emergency_threshold=0.20)


def _a(**kw: object) -> AssessmentResult:
    return AssessmentResult.model_validate(fx.assessment(**kw))


# --- G1 ------------------------------------------------------------------------------------


def test_g1_escalates_above_threshold() -> None:
    raw = _a(triage_level="ROUTINE_DAYS", emergency_probability=0.35)
    final, report, text = apply_guard(raw, ON)
    assert final.triage_level is TriageLevel.EMERGENCY_NOW
    assert final.patient_message == EMERGENCY_TEMPLATE_FA
    assert report.actions == ["safety_floor_escalation"]
    assert report.raw_triage_level is TriageLevel.ROUTINE_DAYS
    assert report.final_triage_level is TriageLevel.EMERGENCY_NOW
    assert text == f"{EMERGENCY_TEMPLATE_FA}\n\n{DISCLAIMER_FA}"
    # the input is not mutated
    assert raw.triage_level is TriageLevel.ROUTINE_DAYS
    assert raw.patient_message != EMERGENCY_TEMPLATE_FA


def test_g1_threshold_boundary_equal_escalates() -> None:
    final, report, _ = apply_guard(_a(triage_level="URGENT_24H", emergency_probability=0.20), ON)
    assert final.triage_level is TriageLevel.EMERGENCY_NOW
    assert report.actions == ["safety_floor_escalation"]


def test_g1_below_threshold_no_escalation() -> None:
    raw = _a(triage_level="URGENT_24H", emergency_probability=0.19)
    final, report, text = apply_guard(raw, ON)
    assert final.triage_level is TriageLevel.URGENT_24H
    assert report.actions == []
    assert text == f"{raw.patient_message}\n\n{DISCLAIMER_FA}"


def test_g1_disabled() -> None:
    final, report, _ = apply_guard(_a(triage_level="URGENT_24H", emergency_probability=0.9), OFF)
    assert final.triage_level is TriageLevel.URGENT_24H
    assert report.actions == []


def test_g1_already_emergency() -> None:
    raw = _a(triage_level="EMERGENCY_NOW", emergency_probability=0.9, patient_message="برو اورژانس")
    final, report, text = apply_guard(raw, ON)
    assert report.actions == []
    assert final.patient_message == "برو اورژانس"
    assert text == f"برو اورژانس\n\n{DISCLAIMER_FA}"
    assert report.raw_triage_level == report.final_triage_level == TriageLevel.EMERGENCY_NOW


# --- G2 ------------------------------------------------------------------------------------


def test_g2_low_prob_emergency() -> None:
    _, report, _ = apply_guard(_a(triage_level="EMERGENCY_NOW", emergency_probability=0.05), ON)
    assert report.flags == ["low_prob_emergency"]


@pytest.mark.parametrize("level", ["SELF_CARE", "ROUTINE_DAYS"])
def test_g2_high_prob_nonurgent_with_floor_off(level: str) -> None:
    _, report, _ = apply_guard(_a(triage_level=level, emergency_probability=0.10), OFF)
    assert report.flags == ["high_prob_nonurgent"]


def test_g2_high_prob_nonurgent_below_floor_threshold() -> None:
    _, report, _ = apply_guard(_a(triage_level="SELF_CARE", emergency_probability=0.15), ON)
    assert report.flags == ["high_prob_nonurgent"]
    assert report.actions == []


def test_g2_no_flags() -> None:
    _, report, _ = apply_guard(_a(triage_level="URGENT_24H", emergency_probability=0.15), OFF)
    assert report.flags == []
    _, report, _ = apply_guard(_a(triage_level="SELF_CARE", emergency_probability=0.09), OFF)
    assert report.flags == []


def test_g2_not_flagged_after_escalation() -> None:
    _, report, _ = apply_guard(_a(triage_level="SELF_CARE", emergency_probability=0.5), ON)
    assert report.actions == ["safety_floor_escalation"]
    assert report.flags == []


# --- G3 ------------------------------------------------------------------------------------


def test_g3_sorted_no_normalization() -> None:
    raw = _a(differential=[fx.hypothesis("B", 0.2), fx.hypothesis("A", 0.7)])
    final, report, _ = apply_guard(raw, ON)
    assert [h.name_en for h in final.differential] == ["A", "B"]
    assert [h.probability for h in final.differential] == [0.7, 0.2]
    assert "ddx_normalized" not in report.flags


def test_g3_sum_exactly_one_not_normalized() -> None:
    raw = _a(
        differential=[fx.hypothesis("A", 0.7), fx.hypothesis("B", 0.2), fx.hypothesis("C", 0.1)]
    )
    _, report, _ = apply_guard(raw, ON)
    assert report.flags == []


def test_g3_normalization() -> None:
    raw = _a(
        differential=[fx.hypothesis("A", 0.8), fx.hypothesis("B", 0.6), fx.hypothesis("C", 0.6)]
    )
    final, report, _ = apply_guard(raw, ON)
    assert report.flags == ["ddx_normalized"]
    assert [h.probability for h in final.differential] == pytest.approx([0.4, 0.3, 0.3])
    assert sum(h.probability for h in final.differential) == pytest.approx(1.0)
    assert raw.differential[0].probability == 0.8


def test_g3_truncation() -> None:
    # bypass schema limits (1..5) to exercise the guard's own truncation
    raw = _a()
    ddx = [Hypothesis.model_validate(fx.hypothesis(f"H{i}", i / 100)) for i in range(1, 8)]
    object.__setattr__(raw, "differential", ddx)
    final, report, _ = apply_guard(raw, ON)
    assert [h.name_en for h in final.differential] == ["H7", "H6", "H5", "H4", "H3"]
    assert report.flags == []


# --- G4 ------------------------------------------------------------------------------------


def test_g4_specialty_invalid_flag() -> None:
    raw = AssessmentResult.model_validate_json(fx.js(fx.assessment(specialty_primary="brain")))
    final, report, _ = apply_guard(raw, ON)
    assert final.specialty_primary == "general_practice"
    assert report.flags == ["specialty_invalid"]


def test_g4_valid_specialty_no_flag() -> None:
    _, report, _ = apply_guard(_a(specialty_secondary="cardiology"), ON)
    assert "specialty_invalid" not in report.flags


# --- G5 ------------------------------------------------------------------------------------


def test_g5_disclaimer_always_appended() -> None:
    for kw in ({"emergency_probability": 0.9}, {"emergency_probability": 0.0}):
        _, _, text = apply_guard(_a(**kw), ON)
        assert text.endswith(f"\n\n{DISCLAIMER_FA}")


def test_multiple_flags_combined() -> None:
    raw = AssessmentResult.model_validate(
        fx.assessment(
            triage_level="EMERGENCY_NOW",
            emergency_probability=0.01,
            specialty_primary="x",
            differential=[fx.hypothesis("A", 0.9), fx.hypothesis("B", 0.9)],
        )
    )
    _, report, _ = apply_guard(raw, ON)
    assert report.flags == ["low_prob_emergency", "ddx_normalized", "specialty_invalid"]
