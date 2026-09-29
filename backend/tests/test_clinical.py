import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.agents import texts_fa
from app.agents.clinical_schemas import (
    AssessmentResult,
    CantMiss,
    ClinicalState,
    Hypothesis,
    SimpleTurn,
    Specialty,
    TriageLevel,
    TurnDecision,
)
from app.agents.prompts import loader
from tests import fixtures as fx

SPEC = (Path(__file__).parents[1] / "docs" / "AGENT_SPEC.md").read_text(encoding="utf-8")
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


# --- enums ---------------------------------------------------------------------------------


def test_enum_codes() -> None:
    assert [t.value for t in TriageLevel] == [
        "EMERGENCY_NOW",
        "URGENT_24H",
        "ROUTINE_DAYS",
        "SELF_CARE",
        "INSUFFICIENT_INFO",
    ]
    assert len(Specialty) == 21
    for code in re.findall(
        r"^\| ([a-z_]+) \| ", SPEC[SPEC.index("### 2.2") : SPEC.index("### 2.3")], re.M
    ):
        assert Specialty(code)


# --- Probability / Hypothesis / CantMiss ----------------------------------------------------


@pytest.mark.parametrize("p", [0, 0.0, 0.5, 1, 1.0])
def test_probability_valid(p: float) -> None:
    assert Hypothesis.model_validate(fx.hypothesis(p=p)).probability == p


@pytest.mark.parametrize("p", [-0.01, 1.01, "high"])
def test_probability_invalid(p: object) -> None:
    with pytest.raises(ValidationError):
        Hypothesis.model_validate(fx.hypothesis(p=p))  # type: ignore[arg-type]


def test_cant_miss_status() -> None:
    CantMiss.model_validate(fx.cant_miss())
    with pytest.raises(ValidationError):
        CantMiss.model_validate({**fx.cant_miss(), "status": "maybe"})


def test_clinical_state_defaults_and_literals() -> None:
    state = ClinicalState.model_validate({})
    assert state.symptoms == [] and state.age_years is None
    ClinicalState.model_validate({"symptoms": [{"name": "سردرد", "severity_0_10": 5}]})
    with pytest.raises(ValidationError):
        ClinicalState.model_validate({"sex": "other"})
    with pytest.raises(ValidationError):
        ClinicalState.model_validate({"pregnancy_possible": "maybe"})


# --- TurnDecision --------------------------------------------------------------------------


@pytest.mark.parametrize("action", ["ask", "clarify", "conclude"])
def test_turn_decision_valid(action: str) -> None:
    td = TurnDecision.model_validate_json(fx.js(fx.turn_decision(action)))
    assert td.next_action == action


@pytest.mark.parametrize("n", [0, 6])
def test_turn_decision_hypotheses_length(n: int) -> None:
    data = fx.turn_decision(hypotheses=[fx.hypothesis() for _ in range(n)])
    with pytest.raises(ValidationError, match="hypotheses"):
        TurnDecision.model_validate(data)


def test_turn_decision_cant_miss_length() -> None:
    TurnDecision.model_validate(fx.turn_decision(cant_miss=[]))
    TurnDecision.model_validate(fx.turn_decision(cant_miss=[fx.cant_miss()] * 6))
    with pytest.raises(ValidationError, match="cant_miss"):
        TurnDecision.model_validate(fx.turn_decision(cant_miss=[fx.cant_miss()] * 7))


@pytest.mark.parametrize("action", ["ask", "clarify"])
def test_turn_decision_asking_requires_message(action: str) -> None:
    with pytest.raises(ValidationError, match="non-empty"):
        TurnDecision.model_validate(fx.turn_decision(action, message_to_patient="  "))


@pytest.mark.parametrize("text", ["", "  ", "خداحافظ، مراقب خودتان باشید."])
def test_turn_decision_conclude_accepts_and_discards_message(text: str) -> None:
    td = TurnDecision.model_validate(fx.turn_decision("conclude", message_to_patient=text))
    assert td.message_to_patient == ""  # D-024


def test_turn_decision_requires_stop_reason_key() -> None:
    data = fx.turn_decision()
    del data["stop_reason"]
    with pytest.raises(ValidationError):
        TurnDecision.model_validate(data)
    with pytest.raises(ValidationError):
        TurnDecision.model_validate(fx.turn_decision(stop_reason="bored"))


# --- AssessmentResult ----------------------------------------------------------------------


def test_assessment_valid() -> None:
    a = AssessmentResult.model_validate_json(fx.js(fx.assessment()))
    assert a.triage_level is TriageLevel.ROUTINE_DAYS
    assert a.specialty_primary is Specialty.neurology
    assert a.specialty_invalid is False
    assert "_specialty_invalid" not in a.model_dump()


@pytest.mark.parametrize("n", [0, 6])
def test_assessment_differential_length(n: int) -> None:
    with pytest.raises(ValidationError, match="differential"):
        AssessmentResult.model_validate(fx.assessment(differential=[fx.hypothesis()] * n))


@pytest.mark.parametrize(
    "field,value",
    [
        ("triage_level", "SOON"),
        ("emergency_probability", 1.5),
        ("confidence", "certain"),
        ("clinical_summary", {"chief_complaint": "x"}),
    ],
)
def test_assessment_invalid_fields(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        AssessmentResult.model_validate(fx.assessment(**{field: value}))


def test_assessment_unknown_specialty_mapped_before_validation() -> None:
    raw = fx.js(fx.assessment(specialty_primary="cardiac_surgery", specialty_secondary="neurology"))
    a = AssessmentResult.model_validate_json(raw)
    assert a.specialty_primary is Specialty.general_practice
    assert a.specialty_secondary is Specialty.neurology
    assert a.specialty_invalid is True

    b = AssessmentResult.model_validate(fx.assessment(specialty_secondary=42))
    assert b.specialty_secondary is Specialty.general_practice
    assert b.specialty_invalid is True

    c = AssessmentResult.model_validate(fx.assessment(specialty_secondary=None))
    assert c.specialty_secondary is None and c.specialty_invalid is False


def test_assessment_missing_specialty_still_fails() -> None:
    data = fx.assessment()
    del data["specialty_primary"]
    with pytest.raises(ValidationError, match="specialty_primary"):
        AssessmentResult.model_validate(data)
    with pytest.raises(ValidationError):
        AssessmentResult.model_validate("not a dict")


def test_specialty_flag_survives_nesting_and_copy() -> None:
    st = SimpleTurn.model_validate(
        fx.simple_turn("conclude", assessment=fx.assessment(specialty_primary="heart"))
    )
    assert st.assessment is not None
    assert st.assessment.specialty_invalid is True
    assert st.assessment.model_copy(deep=True).specialty_invalid is True


# --- SimpleTurn ----------------------------------------------------------------------------


def test_simple_turn_valid() -> None:
    assert SimpleTurn.model_validate(fx.simple_turn("ask")).assessment is None
    assert SimpleTurn.model_validate(fx.simple_turn("conclude")).assessment is not None


def test_simple_turn_conclude_requires_assessment() -> None:
    with pytest.raises(ValidationError, match="assessment is required"):
        SimpleTurn.model_validate(fx.simple_turn("conclude", assessment=None))


def test_simple_turn_ask_rejects_assessment() -> None:
    with pytest.raises(ValidationError, match="must be null"):
        SimpleTurn.model_validate(fx.simple_turn("ask", assessment=fx.assessment()))


def test_simple_turn_ask_requires_message() -> None:
    with pytest.raises(ValidationError, match="non-empty"):
        SimpleTurn.model_validate(fx.simple_turn("ask", message_to_patient=""))


def test_simple_turn_conclude_allows_message() -> None:
    st = SimpleTurn.model_validate(fx.simple_turn("conclude", message_to_patient=""))
    assert st.action == "conclude"


def test_simple_turn_invalid_action() -> None:
    with pytest.raises(ValidationError):
        SimpleTurn.model_validate(fx.simple_turn("clarify"))


# --- Persian texts -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name", ["GREETING_FA", "EMERGENCY_TEMPLATE_FA", "DISCLAIMER_FA", "ERROR_FA"]
)
def test_texts_equal_spec(name: str) -> None:
    m = re.search(rf"- `{name}`:\n  > (.+)\n", SPEC)
    assert m is not None
    assert getattr(texts_fa, name) == m.group(1)


def test_label_maps_equal_spec() -> None:
    triage_sec = SPEC[SPEC.index("### 2.1") : SPEC.index("### 2.2")]
    rows = re.findall(r"^\| `([A-Z_0-9]+)` \| [^|]+ \| ([^|]+) \|$", triage_sec, re.M)
    assert {TriageLevel(c): label.strip() for c, label in rows} == texts_fa.TRIAGE_LABELS_FA
    spec_sec = SPEC[SPEC.index("### 2.2") : SPEC.index("### 2.3")]
    rows = re.findall(r"^\| ([a-z_]+) \| ([^|]+) \|$", spec_sec, re.M)
    assert {Specialty(c): label.strip() for c, label in rows} == texts_fa.SPECIALTY_LABELS_FA
    assert set(texts_fa.SPECIALTY_LABELS_FA) == set(Specialty)


# --- prompts -------------------------------------------------------------------------------

PROMPT_HEADINGS = {
    "common_clinician": "## 4. Shared prompt block",
    "simple_system": "## 5. Architecture A prompt",
    "structured_turn_system": "### 6.1 `structured_turn_system.md`",
    "structured_assessment_system": "### 6.2 `structured_assessment_system.md`",
    "repair": "## 7. Repair prompt",
}


@pytest.mark.parametrize("name,heading", PROMPT_HEADINGS.items())
def test_prompt_files_verbatim(name: str, heading: str) -> None:
    block = re.compile(r"^```\n(.*?)^```$", re.S | re.M).search(SPEC, SPEC.index(heading))
    assert block is not None
    assert loader.load(name, "v1") == block.group(1).removesuffix("\n")


@pytest.mark.parametrize("name", PROMPT_HEADINGS)
def test_prompts_render_without_leftover_placeholders(name: str) -> None:
    text = loader.render(name, "v1", end_reason="max_questions", validation_error="bad json")
    assert not PLACEHOLDER.findall(text), PLACEHOLDER.findall(text)


def test_render_content() -> None:
    common = loader.load("common_clinician")
    simple = loader.render("simple_system")
    assert simple.startswith(common)
    assert '"triage_level"' in simple  # schema description injected
    turn = loader.render("structured_turn_system")
    assert '"next_action"' in turn and '"message_to_patient"' in turn
    assessment = loader.render("structured_assessment_system", end_reason="evaluator_ended")
    assert "(reason: evaluator_ended)" in assessment
    repair = loader.render("repair", validation_error="field required")
    assert "Error: field required" in repair
    assert loader.schema_description(AssessmentResult).startswith("{\n  ")


def test_render_unknown_prompt() -> None:
    with pytest.raises(loader.PromptError):
        loader.render("nope")
    with pytest.raises(loader.PromptError):
        loader.render("repair", "v99")
    assert loader.available_versions() == ["v1"]
