import pytest

from app.agents.clinical_schemas import AssessmentResult, TurnDecision
from app.agents.json_runner import AgentOutputError, TraceRecord, extract_json, run_json
from app.llm.client import LLMError, LLMMessage, LLMRequest
from app.llm.fake import FakeLLM
from tests import fixtures as fx


def _req() -> LLMRequest:
    return LLMRequest(
        model="m/x",
        messages=[LLMMessage(role="system", content="S"), LLMMessage(role="user", content="U")],
    )


class Tracer:
    def __init__(self) -> None:
        self.records: list[TraceRecord] = []

    def __call__(self, rec: TraceRecord) -> None:
        self.records.append(rec)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ('{"a": 1}', '{"a": 1}'),
        ('```json\n{"a": 1}\n```', '{"a": 1}'),
        ('```\n{"a": 1}\n```', '{"a": 1}'),
        ('Sure! Here it is: {"a": {"b": 2}} Hope this helps.', '{"a": {"b": 2}}'),
        ("no json here", "no json here"),
    ],
)
def test_extract_json(raw: str, expected: str) -> None:
    assert extract_json(raw) == expected


async def test_valid_first_try() -> None:
    llm, tr = FakeLLM([fx.js(fx.assessment())]), Tracer()
    result, responses = await run_json(
        llm, _req(), AssessmentResult, purpose="assessment", trace=tr
    )
    assert isinstance(result, AssessmentResult)
    assert len(responses) == 1 and len(llm.requests) == 1
    assert [(r.purpose, r.attempt, r.parsed_ok, r.error) for r in tr.records] == [
        ("assessment", 1, True, None)
    ]
    assert tr.records[0].response is responses[0]


async def test_fenced_json() -> None:
    llm, tr = FakeLLM([f"```json\n{fx.js(fx.turn_decision())}\n```"]), Tracer()
    result, _ = await run_json(llm, _req(), TurnDecision, purpose="turn", trace=tr)
    assert result.next_action == "ask"
    assert tr.records[0].parsed_ok


async def test_invalid_then_valid() -> None:
    bad = fx.js(fx.assessment(triage_level="SOON"))
    llm, tr = FakeLLM([bad, fx.js(fx.assessment())]), Tracer()
    result, responses = await run_json(
        llm, _req(), AssessmentResult, purpose="assessment", trace=tr
    )
    assert result.triage_level == "ROUTINE_DAYS"
    assert len(responses) == 2
    second = llm.requests[1].messages
    assert [m.role for m in second] == ["system", "user", "assistant", "user"]
    assert second[2].content == bad
    assert second[3].content.startswith("Your previous reply could not be parsed")
    assert "triage_level" in second[3].content
    assert [(r.purpose, r.attempt, r.parsed_ok) for r in tr.records] == [
        ("assessment", 1, False),
        ("repair", 2, True),
    ]
    assert tr.records[0].error and "triage_level" in tr.records[0].error
    assert len(tr.records[1].request.messages) == 4
    # the original request is not mutated
    assert len(llm.requests[0].messages) == 2


async def test_non_json_then_invalid_raises() -> None:
    llm, tr = FakeLLM(["I cannot help", '{"next_action": "ask"}']), Tracer()
    with pytest.raises(AgentOutputError, match="TurnDecision invalid after repair"):
        await run_json(llm, _req(), TurnDecision, purpose="turn", trace=tr)
    assert [(r.purpose, r.attempt, r.parsed_ok) for r in tr.records] == [
        ("turn", 1, False),
        ("repair", 2, False),
    ]
    assert all(r.error for r in tr.records)


async def test_validation_error_truncated() -> None:
    long_bad = fx.js(fx.assessment(differential=[{"x": i} for i in range(5)]))
    llm, tr = FakeLLM([long_bad, fx.js(fx.assessment())]), Tracer()
    await run_json(llm, _req(), AssessmentResult, purpose="assessment", trace=tr)
    assert tr.records[0].error is not None and len(tr.records[0].error) <= 1500


async def test_llm_error_is_traced_and_raised() -> None:
    llm, tr = FakeLLM([LLMError("HTTP 500")]), Tracer()
    with pytest.raises(LLMError):
        await run_json(llm, _req(), AssessmentResult, purpose="assessment", trace=tr)
    assert [(r.purpose, r.attempt, r.parsed_ok, r.error) for r in tr.records] == [
        ("assessment", 1, False, "HTTP 500")
    ]
    assert tr.records[0].response is None


async def test_llm_error_on_repair() -> None:
    llm, tr = FakeLLM(["nope", LLMError("timeout")]), Tracer()
    with pytest.raises(LLMError):
        await run_json(llm, _req(), AssessmentResult, purpose="assessment", trace=tr)
    assert [(r.purpose, r.parsed_ok) for r in tr.records] == [
        ("assessment", False),
        ("repair", False),
    ]
