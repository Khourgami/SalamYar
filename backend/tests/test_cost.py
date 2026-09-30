"""Token and cost accounting (D-035, contract v1.2): prices, per-call estimates, session totals."""

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import select

from app import db as app_db
from app.db import models as m
from app.db.engine import SchemaError
from app.db.types import dumps, loads
from app.llm.client import LLMError, LLMResponse
from tests.lab import ASK, ASSESSMENT, B_CONCLUDE, TEST_AGENTS, Lab


def _snapshot(sid: str) -> dict:
    with app_db.session_factory()() as db:
        sess = db.get(m.Session, sid)
        assert sess is not None
        return loads(sess.agent_snapshot_json)


# --- T1: pricing in the session snapshot ---------------------------------------------------


def test_snapshot_contains_prices(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]
    assert _snapshot(sid)["pricing"] == {
        "input_per_mtok": 2.0,
        "output_per_mtok": 8.0,
        "source": "t",
        "as_of": "2026-09-30",
    }


def test_reload_with_new_prices_affects_only_new_sessions(lab: Lab) -> None:
    old = lab.create("a-simple")["id"]
    Path(lab.registry.path).write_text(
        TEST_AGENTS.replace(
            "test/simple-model: { input_per_mtok: 1.0, output_per_mtok: 4.0",
            "test/simple-model: { input_per_mtok: 3.0, output_per_mtok: 9.0",
        ),
        encoding="utf-8",
    )
    lab.user("boss", "admin")
    assert lab.req("POST", "/admin/agents/reload", "boss").status_code == 200
    new = lab.create("a-simple")["id"]
    assert _snapshot(old)["pricing"]["input_per_mtok"] == 1.0
    assert _snapshot(new)["pricing"]["input_per_mtok"] == 3.0
    assert _snapshot(new)["pricing"]["output_per_mtok"] == 9.0


# --- T2: per-call estimate and session totals ----------------------------------------------


def _usage(
    text: str,
    prompt: int | None,
    completion: int | None,
    reasoning: int | None = None,
    cost: float | None = None,
) -> LLMResponse:
    return LLMResponse(
        text=text,
        model_reported="test",
        prompt_tokens=prompt,
        completion_tokens=completion,
        reasoning_tokens=reasoning,
        cost_usd=cost,
        latency_ms=5,
        raw={},
    )


def _calls(sid: str) -> list[m.LLMCall]:
    with app_db.session_factory()() as db:
        return list(
            db.scalars(
                select(m.LLMCall).where(m.LLMCall.session_id == sid).order_by(m.LLMCall.created_at)
            )
        )


def _session(sid: str) -> m.Session:
    with app_db.session_factory()() as db:
        sess = db.get(m.Session, sid)
        assert sess is not None
        return sess


def test_estimate_stored_per_call_with_price_snapshot(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(ASK)  # FakeLLM default usage: 100 prompt, 50 completion, cost 0.001
    assert lab.send(sid, "سردرد دارم").status_code == 200
    [call] = _calls(sid)
    assert (call.price_input_per_mtok, call.price_output_per_mtok) == (1.0, 4.0)
    assert call.estimated_cost_usd == pytest.approx((100 * 1.0 + 50 * 4.0) / 1e6)
    sess = _session(sid)
    assert sess.llm_call_count == 1
    assert (sess.total_prompt_tokens, sess.total_completion_tokens) == (100, 50)
    assert sess.total_reasoning_tokens is None  # no call reported reasoning tokens
    assert sess.total_estimated_cost_usd == pytest.approx(0.0003)
    assert sess.total_cost_usd == pytest.approx(0.001)


def test_call_without_usage_has_no_estimate_and_keeps_token_totals(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(_usage(ASK, 200, 30, 10, 0.002))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    lab.llm.push(_usage(ASK, None, None))
    assert lab.send(sid, "از دیروز").status_code == 200
    second = _calls(sid)[1]
    assert second.estimated_cost_usd is None
    assert second.price_input_per_mtok == 1.0  # the price snapshot is stored anyway
    sess = _session(sid)
    assert sess.llm_call_count == 2
    assert (sess.total_prompt_tokens, sess.total_completion_tokens) == (200, 30)
    assert sess.total_reasoning_tokens == 10
    assert sess.total_estimated_cost_usd == pytest.approx((200 * 1.0 + 30 * 4.0) / 1e6)
    assert sess.total_cost_usd == pytest.approx(0.002)


def test_structured_totals_with_repair_equal_sum_of_traces(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]  # price 2 / 8 per 1M
    lab.llm.push(
        _usage("not json", 1000, 300, 100, 0.01),  # turn, invalid
        _usage(B_CONCLUDE, 1400, 200, 50, 0.02),  # repair
        _usage(ASSESSMENT, 900, 700, None, 0.03),  # assessment
    )
    r = lab.send(sid, "سردرد دارم")
    assert r.status_code == 200 and r.json()["session"]["status"] == "completed"
    calls = _calls(sid)
    assert [(c.purpose, c.attempt) for c in calls] == [
        ("turn", 1),
        ("repair", 2),
        ("assessment", 1),
    ]
    expected = [(1000 * 2 + 300 * 8) / 1e6, (1400 * 2 + 200 * 8) / 1e6, (900 * 2 + 700 * 8) / 1e6]
    assert [c.estimated_cost_usd for c in calls] == pytest.approx(expected)
    sess = _session(sid)
    assert sess.llm_call_count == 3
    assert sess.total_prompt_tokens == 3300
    assert sess.total_completion_tokens == 1200
    assert sess.total_reasoning_tokens == 150
    assert sess.total_estimated_cost_usd == pytest.approx(sum(expected))
    assert sess.total_cost_usd == pytest.approx(0.06)


def test_failed_attempts_are_counted(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(LLMError("provider down"))
    r = lab.send(sid, "سردرد دارم")
    assert r.status_code == 502
    sess = _session(sid)
    assert sess.llm_call_count == 1
    assert sess.total_prompt_tokens is None and sess.total_estimated_cost_usd is None
    [call] = _calls(sid)
    assert call.estimated_cost_usd is None and call.price_input_per_mtok == 1.0

    lab.llm.push("garbage", ASK)  # invalid output + successful repair, both with usage
    assert lab.send(sid, "سردرد دارم").status_code == 200
    sess = _session(sid)
    assert sess.llm_call_count == 3
    assert sess.total_prompt_tokens == 200
    assert sess.total_estimated_cost_usd == pytest.approx(2 * 0.0003)


def test_pre_v12_snapshot_without_pricing_stores_no_estimate(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    with app_db.session_factory()() as db:
        sess = db.get(m.Session, sid)
        assert sess is not None
        snap = loads(sess.agent_snapshot_json)
        snap.pop("pricing")
        sess.agent_snapshot_json = dumps(snap)
        db.commit()
    lab.llm.push(ASK)
    assert lab.send(sid, "سردرد دارم").status_code == 200
    [call] = _calls(sid)
    assert call.price_input_per_mtok is None and call.estimated_cost_usd is None
    assert _session(sid).total_prompt_tokens == 100


# --- T2: schema check -----------------------------------------------------------------------


def test_schema_check_fails_on_old_database(tmp_path: Path) -> None:
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")  # complete enough to be ignored
    con.execute(
        "CREATE TABLE llm_calls (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, "
        "purpose TEXT, model TEXT, request_json TEXT, response_text TEXT, parsed_ok BOOLEAN, "
        "error TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, reasoning_tokens INTEGER, "
        "cost_usd FLOAT, latency_ms INTEGER, attempt INTEGER, created_at TEXT)"
    )
    con.commit()
    con.close()
    app_db.configure(str(path))
    with pytest.raises(SchemaError, match="older than v1.2") as exc:
        app_db.init_db()
    msg = str(exc.value)
    assert "delete data/*.db or use a new DATABASE_PATH" in msg
    assert "llm_calls.estimated_cost_usd" in msg and "llm_calls.price_input_per_mtok" in msg
    assert "users.username" in msg


def test_schema_check_passes_on_current_database(tmp_path: Path) -> None:
    path = tmp_path / "new.db"
    app_db.configure(str(path))
    app_db.init_db()
    app_db.init_db()  # idempotent on a current file
