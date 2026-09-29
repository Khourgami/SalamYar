import json

import pytest

from app.agents.architectures import SimpleArchitecture, StructuredArchitecture, build_architecture
from app.agents.base import SessionContext, TranscriptEntry, build_transcript
from app.agents.clinical_schemas import ClinicalState, Hypothesis, TriageLevel
from app.agents.config import AgentConfig, AgentOptions
from app.agents.json_runner import AgentOutputError, TraceRecord
from app.agents.prompts.loader import render
from app.agents.texts_fa import DISCLAIMER_FA, EMERGENCY_TEMPLATE_FA, GREETING_FA
from app.llm.fake import FakeLLM
from tests import fixtures as fx


def _cfg(arch: str = "simple", **kw: object) -> AgentConfig:
    return AgentConfig.model_validate(
        {"id": f"{arch[0]}-test", "display_name": "D", "architecture": arch, "model": "m/x", **kw}
    )


def _ctx(arch: str = "simple", *, patient: list[str] | None = None, **kw: object) -> SessionContext:
    transcript = [TranscriptEntry(role="agent", text=GREETING_FA)]
    for text in patient or ["سردرد دارم"]:
        transcript.append(TranscriptEntry(role="patient", text=text))
    traces: list[TraceRecord] = []
    ctx = SessionContext(config=_cfg(arch, **kw), transcript=transcript, trace=traces.append)
    ctx.traces = traces  # type: ignore[attr-defined]
    return ctx


def test_build_transcript_excludes_errors() -> None:
    rows = [
        ("agent", "greeting", "g"),
        ("patient", "text", "p1"),
        ("agent", "error", "err"),
        ("patient", "text", "p2"),
        ("agent", "question", "q"),
    ]
    assert [(e.role, e.text) for e in build_transcript(rows)] == [
        ("agent", "g"),
        ("patient", "p1"),
        ("patient", "p2"),
        ("agent", "q"),
    ]


def test_build_architecture() -> None:
    llm = FakeLLM()
    assert isinstance(build_architecture(_cfg("simple"), llm), SimpleArchitecture)
    assert isinstance(build_architecture(_cfg("structured"), llm), StructuredArchitecture)


# --- simple --------------------------------------------------------------------------------


async def test_simple_ask_path_and_role_mapping() -> None:
    llm = FakeLLM([fx.js(fx.simple_turn("ask"))])
    ctx = _ctx(patient=["سردرد دارم"])
    ctx.transcript += [
        TranscriptEntry(role="agent", text="از کی؟"),
        TranscriptEntry(role="patient", text="از دیروز"),
    ]
    out = await SimpleArchitecture(llm).next_turn(ctx)
    assert out.kind == "question"
    assert out.agent_message == "درد از کی شروع شد؟"
    assert out.backstage == {"reasoning_note": "Leading: migraine."}
    assert out.assessment is None and out.guard_report is None

    req = llm.requests[0]
    assert [(m.role, m.content) for m in req.messages[1:]] == [
        ("assistant", GREETING_FA),
        ("user", "سردرد دارم"),
        ("assistant", "از کی؟"),
        ("user", "از دیروز"),
    ]
    assert req.messages[0].role == "system"
    assert req.messages[0].content == render("simple_system")
    assert req.model == "m/x" and req.temperature == 0.3 and req.reasoning_effort == "low"
    assert req.output_mode == "json_object" and req.json_schema is None
    assert [(t.purpose, t.parsed_ok) for t in ctx.traces] == [("turn", True)]  # type: ignore[attr-defined]


async def test_simple_conclude_path_applies_guard() -> None:
    concl = fx.simple_turn(
        "conclude", assessment=fx.assessment(triage_level="URGENT_24H", emergency_probability=0.5)
    )
    llm = FakeLLM([fx.js(concl)])
    out = await SimpleArchitecture(llm).next_turn(_ctx())
    assert out.kind == "result"
    assert out.assessment is not None and out.raw_assessment is not None
    assert out.assessment.triage_level is TriageLevel.EMERGENCY_NOW
    assert out.raw_assessment.triage_level is TriageLevel.URGENT_24H
    assert out.guard_report is not None
    assert out.guard_report.actions == ["safety_floor_escalation"]
    assert out.agent_message == f"{EMERGENCY_TEMPLATE_FA}\n\n{DISCLAIMER_FA}"
    assert out.backstage == {"reasoning_note": "Leading: migraine."}


async def test_simple_conclude_without_escalation_uses_patient_message() -> None:
    llm = FakeLLM([fx.js(fx.simple_turn("conclude"))])
    out = await SimpleArchitecture(llm).next_turn(_ctx())
    assert out.agent_message == f"{fx.assessment()['patient_message']}\n\n{DISCLAIMER_FA}"


async def test_simple_force_conclude_success() -> None:
    llm = FakeLLM([fx.js(fx.simple_turn("conclude"))])
    ctx = _ctx()
    out = await SimpleArchitecture(llm).force_conclude(ctx, "evaluator_ended")
    assert out.kind == "result"
    last = llm.requests[0].messages[-1]
    assert (last.role, last.content) == ("system", 'Conclude now. Set action to "conclude".')
    assert [t.purpose for t in ctx.traces] == ["assessment"]  # type: ignore[attr-defined]


async def test_simple_force_conclude_still_asking_raises() -> None:
    llm = FakeLLM([fx.js(fx.simple_turn("ask"))])
    with pytest.raises(AgentOutputError, match="after being told to conclude"):
        await SimpleArchitecture(llm).force_conclude(_ctx(), "max_questions")


async def test_simple_temperature_omitted_and_json_schema_mode() -> None:
    llm = FakeLLM([fx.js(fx.simple_turn("ask"))])
    ctx = _ctx(send_temperature=False, output_mode="json_schema", reasoning_effort=None)
    await SimpleArchitecture(llm).next_turn(ctx)
    req = llm.requests[0]
    assert req.temperature is None and req.reasoning_effort is None
    assert req.json_schema is not None and req.json_schema["name"] == "SimpleTurn"
    assert "properties" in req.json_schema["schema"]


async def test_simple_repair_path() -> None:
    llm = FakeLLM(["oops", fx.js(fx.simple_turn("ask"))])
    ctx = _ctx()
    out = await SimpleArchitecture(llm).next_turn(ctx)
    assert out.kind == "question"
    assert [t.purpose for t in ctx.traces] == ["turn", "repair"]  # type: ignore[attr-defined]


# --- structured ----------------------------------------------------------------------------


def _structured_ctx(**kw: object) -> tuple[SessionContext, list[ClinicalState]]:
    saved: list[ClinicalState] = []
    ctx = _ctx("structured", **kw)
    ctx.save_clinical_state = saved.append
    return ctx, saved


async def test_structured_ask_path() -> None:
    llm = FakeLLM([fx.js(fx.turn_decision("ask"))])
    ctx, saved = _structured_ctx()
    ctx.questions_asked = 2
    ctx.previous_hypotheses = [Hypothesis.model_validate(fx.hypothesis("Previous", 0.4))]
    out = await StructuredArchitecture(llm).next_turn(ctx)

    assert out.kind == "question"
    assert out.agent_message == "سردرد ناگهانی شروع شد یا کم‌کم؟"
    assert "message_to_patient" not in out.backstage
    assert out.backstage["next_action"] == "ask"
    assert out.backstage["question_rationale"] == "Discriminates SAH vs migraine."
    assert out.backstage["clinical_state"]["age_years"] == 35
    assert out.backstage["hypotheses"][0]["name_en"] == "Migraine"
    assert out.backstage["emergency_probability"] == 0.05
    assert out.backstage["stop_reason"] is None
    assert set(out.backstage) == {
        "clinical_state",
        "hypotheses",
        "cant_miss",
        "emergency_probability",
        "next_action",
        "stop_reason",
        "question_rationale",
    }
    assert len(saved) == 1 and saved[0].age_years == 35
    assert ctx.clinical_state == saved[0]

    req = llm.requests[0]
    assert [m.role for m in req.messages] == ["system", "user"]
    assert req.messages[0].content == render("structured_turn_system")
    payload = json.loads(req.messages[1].content)
    assert set(payload) == {
        "clinical_state",
        "previous_hypotheses",
        "questions_asked",
        "max_questions",
        "transcript",
    }
    assert payload["previous_hypotheses"][0]["name_en"] == "Previous"
    assert payload["questions_asked"] == 2 and payload["max_questions"] == 12
    assert payload["clinical_state"]["symptoms"] == []  # empty ClinicalState
    assert payload["transcript"] == [
        {"role": "agent", "text": GREETING_FA},
        {"role": "patient", "text": "سردرد دارم"},
    ]


async def test_structured_clarify_path() -> None:
    llm = FakeLLM([fx.js(fx.turn_decision("clarify"))])
    ctx, saved = _structured_ctx()
    out = await StructuredArchitecture(llm).next_turn(ctx)
    assert out.kind == "question"
    assert out.backstage["next_action"] == "clarify"
    assert len(saved) == 1


async def test_structured_conclude_path_two_calls_in_order() -> None:
    concl = fx.turn_decision("conclude", clinical_state=fx.clinical_state(age_years=60))
    llm = FakeLLM([fx.js(concl), fx.js(fx.assessment())])
    ctx, saved = _structured_ctx()
    out = await StructuredArchitecture(llm).next_turn(ctx)

    assert out.kind == "result"
    assert out.backstage["next_action"] == "conclude"
    assert out.backstage["stop_reason"] == "enough_information"
    assert "message_to_patient" not in out.backstage
    assert out.agent_message.endswith(DISCLAIMER_FA)
    assert saved[0].age_years == 60

    assert len(llm.requests) == 2
    assert llm.requests[0].messages[0].content == render("structured_turn_system")
    assessment_req = llm.requests[1]
    assert assessment_req.messages[0].content == render(
        "structured_assessment_system", end_reason="agent_concluded"
    )
    payload = json.loads(assessment_req.messages[1].content)
    assert payload["end_reason"] == "agent_concluded"
    assert payload["clinical_state"]["age_years"] == 60  # uses the fresh state
    assert set(payload) == {"clinical_state", "transcript", "end_reason"}
    assert [t.purpose for t in ctx.traces] == ["turn", "assessment"]  # type: ignore[attr-defined]


async def test_structured_force_conclude() -> None:
    llm = FakeLLM([fx.js(fx.assessment(triage_level="SELF_CARE", emergency_probability=0.02))])
    ctx, saved = _structured_ctx()
    ctx.clinical_state = ClinicalState.model_validate(fx.clinical_state(age_years=41))
    out = await StructuredArchitecture(llm).force_conclude(ctx, "max_questions")
    assert out.kind == "result"
    assert out.backstage == {"next_action": "conclude", "stop_reason": None}
    assert out.guard_report is not None and out.guard_report.final_triage_level == "SELF_CARE"
    assert saved == []
    assert len(llm.requests) == 1
    payload = json.loads(llm.requests[0].messages[1].content)
    assert payload["end_reason"] == "max_questions"
    assert payload["clinical_state"]["age_years"] == 41
    assert "(reason: max_questions)" in llm.requests[0].messages[0].content


async def test_structured_uses_agent_options_for_guard() -> None:
    llm = FakeLLM([fx.js(fx.assessment(triage_level="URGENT_24H", emergency_probability=0.5))])
    ctx, _ = _structured_ctx(options=AgentOptions(safety_floor=False).model_dump())
    out = await StructuredArchitecture(llm).force_conclude(ctx, "evaluator_ended")
    assert out.assessment is not None and out.assessment.triage_level is TriageLevel.URGENT_24H
