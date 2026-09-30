"""Turn and call deadlines (D-038, BACKEND_ARCHITECTURE §6.3). No test waits more than ~1 s."""

import asyncio
import time
from collections.abc import AsyncIterator

import httpx
import pytest

from app.agents.architectures import StructuredArchitecture
from app.agents.base import SessionContext, TranscriptEntry
from app.agents.clinical_schemas import SimpleTurn
from app.agents.config import AgentConfig
from app.agents.json_runner import TraceRecord, run_json
from app.agents.texts_fa import GREETING_FA
from app.db import models as m
from app.llm.budget import DEADLINE_ERROR, DeadlineExceeded, TurnBudget
from app.llm.client import LLMError, LLMMessage, LLMRequest, LLMResponse
from app.llm.fake import FakeLLM, Slow
from app.llm.openrouter import OpenRouterClient
from app.services import session_service
from app.smoke import format_table, result_to_dict, run_agent
from tests import fixtures as fx
from tests.lab import ASK, B_CONCLUDE, Lab
from tests.test_llm import OK_BODY, Recorder
from tests.test_sessions import _db_rows

BAD = "not json at all"


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class AdvancingLLM(FakeLLM):
    """FakeLLM whose every call advances a fake clock by the next scripted number of seconds."""

    def __init__(self, clock: Clock, advance: list[float], responses: list[str]) -> None:
        super().__init__(responses)
        self.clock = clock
        self.advance = advance

    async def complete(self, req: LLMRequest, budget: TurnBudget | None = None) -> LLMResponse:
        self.clock.now += self.advance.pop(0)
        return await super().complete(req, budget)


def _req() -> LLMRequest:
    return LLMRequest(model="m/x", messages=[LLMMessage(role="user", content="u")])


def _cfg(arch: str) -> AgentConfig:
    return AgentConfig.model_validate(
        {"id": f"{arch[0]}-test", "display_name": "D", "architecture": arch, "model": "m/x"}
    )


# --- TurnBudget ----------------------------------------------------------------------------


def test_budget_arithmetic() -> None:
    clock = Clock()
    budget = TurnBudget(80, 50, clock=clock)
    assert budget.remaining() == 80 and budget.call_timeout() == 50 and budget.can_follow_up()
    clock.now = 40
    assert budget.call_timeout() == 40  # min(call deadline, remaining)
    clock.now = 65
    assert budget.remaining() == 15 and budget.can_follow_up()  # exactly 15 s is enough
    clock.now = 65.5
    assert not budget.can_follow_up()
    with pytest.raises(DeadlineExceeded, match="deadline_exceeded: repair skipped, 14.5 s"):
        budget.require_follow_up("repair")
    clock.now = 100
    assert budget.remaining() == 0 and budget.call_timeout() == 0


def test_budget_defaults() -> None:
    budget = TurnBudget()
    assert (budget.turn_seconds, budget.call_seconds, budget.min_follow_up_seconds) == (80, 50, 15)
    assert issubclass(DeadlineExceeded, LLMError)  # → 502 AGENT_ERROR through the existing path


# --- json_runner ---------------------------------------------------------------------------


async def test_slow_call_is_cut_by_call_deadline_and_traced() -> None:
    traces: list[TraceRecord] = []
    llm = FakeLLM([Slow(2.0, fx.js(fx.simple_turn("ask")))])
    started = time.perf_counter()
    with pytest.raises(DeadlineExceeded, match="turn attempt 1 cut after"):
        await run_json(
            llm, _req(), SimpleTurn, purpose="turn", trace=traces.append, budget=TurnBudget(5, 0.2)
        )
    assert time.perf_counter() - started < 1.0
    [rec] = traces
    assert rec.error == DEADLINE_ERROR and rec.parsed_ok is False and rec.response is None
    assert rec.latency_ms is not None and 150 <= rec.latency_ms < 1000


async def test_call_deadline_is_capped_by_remaining_turn_budget() -> None:
    traces: list[TraceRecord] = []
    llm = FakeLLM([Slow(2.0, "x")])
    started = time.perf_counter()
    with pytest.raises(DeadlineExceeded):
        await run_json(
            llm, _req(), SimpleTurn, purpose="turn", trace=traces.append, budget=TurnBudget(0.2, 50)
        )
    assert time.perf_counter() - started < 1.0
    assert traces[0].error == DEADLINE_ERROR


async def test_no_call_starts_when_budget_is_spent() -> None:
    clock = Clock()
    budget = TurnBudget(80, 50, clock=clock)
    clock.now = 80
    traces: list[TraceRecord] = []
    llm = FakeLLM([fx.js(fx.simple_turn("ask"))])
    with pytest.raises(DeadlineExceeded):
        await run_json(llm, _req(), SimpleTurn, purpose="turn", trace=traces.append, budget=budget)
    assert llm.requests == [] and traces[0].error == DEADLINE_ERROR


async def test_repair_skipped_when_less_than_15s_remain() -> None:
    clock = Clock()
    llm = AdvancingLLM(clock, [66], [BAD, fx.js(fx.simple_turn("ask"))])
    traces: list[TraceRecord] = []
    with pytest.raises(DeadlineExceeded, match="repair skipped, 14.0 s"):
        await run_json(
            llm,
            _req(),
            SimpleTurn,
            purpose="turn",
            trace=traces.append,
            budget=TurnBudget(80, 50, clock=clock),
        )
    assert len(llm.requests) == 1  # no repair call
    assert [(t.purpose, t.parsed_ok) for t in traces] == [("turn", False)]


async def test_repair_runs_when_15s_remain() -> None:
    clock = Clock()
    llm = AdvancingLLM(clock, [65, 1], [BAD, fx.js(fx.simple_turn("ask"))])
    traces: list[TraceRecord] = []
    turn, responses = await run_json(
        llm,
        _req(),
        SimpleTurn,
        purpose="turn",
        trace=traces.append,
        budget=TurnBudget(80, 50, clock=clock),
    )
    assert turn.action == "ask" and len(responses) == 2
    assert all(b is not None for b in llm.budgets)  # the budget reaches the client


# --- OpenRouter client ---------------------------------------------------------------------


class _TrickleStream(httpx.AsyncByteStream):
    """Sends a byte every 20 ms forever: a per-read timeout never fires."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield b'{"choices": ['
        while True:
            await asyncio.sleep(0.02)
            yield b" "


async def test_continuous_stream_is_cut_by_total_deadline() -> None:
    client = OpenRouterClient(
        api_key="k",
        base_url="https://or.test/api/v1",
        timeout_seconds=60,  # per-read timeout, far above the total deadline
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, stream=_TrickleStream())),
    )
    traces: list[TraceRecord] = []
    started = time.perf_counter()
    with pytest.raises(DeadlineExceeded):
        await run_json(
            client,
            _req(),
            SimpleTurn,
            purpose="assessment",
            trace=traces.append,
            budget=TurnBudget(10, 0.3),
        )
    assert time.perf_counter() - started < 1.0
    assert traces[0].error == DEADLINE_ERROR and traces[0].purpose == "assessment"


def _or_client(rec: Recorder) -> OpenRouterClient:
    return OpenRouterClient(
        api_key="k",
        base_url="https://or.test/api/v1",
        retry_delay_seconds=0,
        transport=httpx.MockTransport(rec),
    )


async def test_transport_retry_skipped_when_less_than_15s_remain() -> None:
    clock = Clock()
    budget = TurnBudget(80, 50, clock=clock)
    clock.now = 70
    rec = Recorder(httpx.Response(503), httpx.Response(200, json=OK_BODY))
    with pytest.raises(LLMError, match=r"retry skipped \(10.0 s .*HTTP 503"):
        await _or_client(rec).complete(_req(), budget)
    assert len(rec.requests) == 1


async def test_transport_retry_runs_with_enough_budget() -> None:
    rec = Recorder(httpx.Response(503), httpx.Response(200, json=OK_BODY))
    resp = await _or_client(rec).complete(_req(), TurnBudget())
    assert resp.text == '{"a": 1}' and len(rec.requests) == 2


# --- architecture B ------------------------------------------------------------------------


async def test_structured_skips_assessment_when_budget_is_short() -> None:
    clock = Clock()
    llm = AdvancingLLM(clock, [70], [B_CONCLUDE, fx.js(fx.assessment())])
    saved = []
    traces: list[TraceRecord] = []
    ctx = SessionContext(
        config=_cfg("structured"),
        transcript=[
            TranscriptEntry(role="agent", text=GREETING_FA),
            TranscriptEntry(role="patient", text="سردرد دارم"),
        ],
        trace=traces.append,
        save_clinical_state=saved.append,
        budget=TurnBudget(80, 50, clock=clock),
    )
    with pytest.raises(DeadlineExceeded, match="assessment call skipped"):
        await StructuredArchitecture(llm).next_turn(ctx)
    assert len(llm.requests) == 1  # the assessment call never started
    assert len(saved) == 1 and saved[0].age_years == 35  # new clinical state still saved


# --- API (session service) -----------------------------------------------------------------


def test_api_slow_call_gives_502_releases_lock_and_resend_works(
    lab: Lab, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(session_service, "new_turn_budget", lambda: TurnBudget(5, 0.2))
    sid = lab.create("a-simple")["id"]
    lab.llm.push(Slow(2.0, ASK))
    started = time.perf_counter()
    r = lab.send(sid, "سردرد دارم")
    assert time.perf_counter() - started < 1.5
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "AGENT_ERROR"
    assert r.json()["agent_message"]["kind"] == "error"

    [call] = _db_rows(m.LLMCall, session_id=sid)
    assert call.error == DEADLINE_ERROR and call.parsed_ok is False
    assert call.latency_ms is not None and 150 <= call.latency_ms < 1000
    [sess] = _db_rows(m.Session, id=sid)
    assert sess.turn_in_progress is False and sess.status == "active"

    lab.llm.push(ASK)  # resend the same text
    r2 = lab.send(sid, "سردرد دارم")
    assert r2.status_code == 200 and r2.json()["agent_message"]["kind"] == "question"
    kinds = [(msg["role"], msg["kind"]) for msg in r2.json()["session"]["messages"]]
    assert kinds == [
        ("agent", "greeting"),
        ("patient", "text"),  # reused, not duplicated
        ("agent", "error"),
        ("agent", "question"),
    ]


def test_api_structured_short_budget_skips_assessment_and_keeps_state(
    lab: Lab, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = Clock()
    monkeypatch.setattr(session_service, "new_turn_budget", lambda: TurnBudget(80, 50, clock=clock))
    lab.llm = AdvancingLLM(clock, [70], [B_CONCLUDE, fx.js(fx.assessment())])
    sid = lab.create("b-struct")["id"]
    r = lab.send(sid, "سردرد دارم")
    assert r.status_code == 502 and r.json()["error"]["code"] == "AGENT_ERROR"
    assert len(lab.llm.requests) == 1
    [sess] = _db_rows(m.Session, id=sid)
    assert sess.status == "active" and sess.turn_in_progress is False
    assert '"age_years": 35' in sess.clinical_state_json  # B-011: state persisted
    [call] = _db_rows(m.LLMCall, session_id=sid)
    assert call.purpose == "turn" and call.parsed_ok is True


# --- smoke test ----------------------------------------------------------------------------


async def test_smoke_reports_deadline_as_failure_reason() -> None:
    res = await run_agent(
        _cfg("simple"), FakeLLM([Slow(2.0, ASK)]), new_budget=lambda: TurnBudget(5, 0.2)
    )
    assert res.turn1 == "n" and res.failure == "deadline"
    assert res.error.startswith("DeadlineExceeded: deadline_exceeded")
    data = result_to_dict(res)
    assert data["failure_reason"] == "deadline"
    assert data["calls"][0]["error"] == DEADLINE_ERROR and data["calls"][0]["latency_ms"] >= 150
    assert "| deadline |" in format_table([res])


async def test_smoke_uses_a_fresh_budget_per_step() -> None:
    budgets: list[TurnBudget] = []

    def new_budget() -> TurnBudget:
        budgets.append(TurnBudget())
        return budgets[-1]

    llm = FakeLLM([ASK, ASK, fx.js(fx.simple_turn("conclude"))])
    res = await run_agent(_cfg("simple"), llm, new_budget=new_budget)
    assert res.ok and res.failure == ""
    assert len(budgets) == 3 and llm.budgets == budgets
