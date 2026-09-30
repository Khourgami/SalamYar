"""Phase 2d: serving provider (T1, D-041), cached prompt tokens (T2, D-042), provider order in
the request built from the session snapshot (T3)."""

from pathlib import Path

import pytest
from sqlalchemy import select

from app import db as app_db
from app.db import models as m
from app.db.types import loads
from app.llm.client import LLMError, LLMResponse
from tests.lab import ASK, TEST_AGENTS, Lab


def _resp(
    text: str,
    *,
    prompt: int | None = 1000,
    completion: int | None = 200,
    cached: int | None = None,
    provider: str | None = None,
    cost: float | None = 0.001,
) -> LLMResponse:
    return LLMResponse(
        text=text,
        model_reported="test",
        prompt_tokens=prompt,
        completion_tokens=completion,
        reasoning_tokens=None,
        cost_usd=cost,
        latency_ms=5,
        raw={},
        provider=provider,
        cached_prompt_tokens=cached,
    )


def _calls(sid: str) -> list[m.LLMCall]:
    with app_db.session_factory()() as db:
        q = select(m.LLMCall).where(m.LLMCall.session_id == sid).order_by(m.LLMCall.created_at)
        return list(db.scalars(q))


def _session(sid: str) -> m.Session:
    with app_db.session_factory()() as db:
        sess = db.get(m.Session, sid)
        assert sess is not None
        return sess


def _use_agents(lab: Lab, text: str) -> None:
    Path(lab.registry.path).write_text(text, encoding="utf-8")
    lab.registry.load()
    lab.sync()


CACHED_SIMPLE = TEST_AGENTS.replace(
    "test/simple-model: { input_per_mtok: 1.0, output_per_mtok: 4.0,",
    "test/simple-model: { input_per_mtok: 1.0, output_per_mtok: 4.0, "
    "input_cache_read_per_mtok: 0.1,",
)


def test_provider_stored_per_call_and_null_without_field(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(_resp(ASK, provider="DeepInfra"))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    lab.llm.push(_resp(ASK))  # the response has no provider field
    assert lab.send(sid, "از دیروز").status_code == 200
    assert [c.provider for c in _calls(sid)] == ["DeepInfra", None]


def test_failed_attempt_has_no_provider_or_cached_tokens(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(LLMError("OpenRouter request failed after retry: HTTP 503"))
    assert lab.send(sid, "سردرد دارم").status_code == 502
    [call] = _calls(sid)
    assert call.provider is None and call.cached_prompt_tokens is None
    assert _session(sid).total_cached_prompt_tokens is None


def test_cached_tokens_stored_estimate_uses_cache_price_and_session_total(lab: Lab) -> None:
    _use_agents(lab, CACHED_SIMPLE)
    sid = lab.create("a-simple")["id"]
    lab.llm.push(_resp(ASK, prompt=1000, completion=200, cached=768, provider="OpenAI"))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    lab.llm.push(_resp(ASK, prompt=1200, completion=100, cached=None))
    assert lab.send(sid, "از دیروز").status_code == 200
    first, second = _calls(sid)
    assert first.cached_prompt_tokens == 768
    # (1000 − 768) × 1.0 + 768 × 0.1 + 200 × 4.0 = 232 + 76.8 + 800 = 1108.8 per 1e6
    assert first.estimated_cost_usd == pytest.approx(0.0011088)
    assert second.cached_prompt_tokens is None
    assert second.estimated_cost_usd == pytest.approx((1200 * 1.0 + 100 * 4.0) / 1e6)
    sess = _session(sid)
    assert sess.total_cached_prompt_tokens == 768
    assert sess.total_estimated_cost_usd == pytest.approx(0.0011088 + 0.0016)
    snap = loads(sess.agent_snapshot_json)
    assert snap["pricing"]["input_cache_read_per_mtok"] == 0.1


def test_cached_tokens_without_cache_price_keep_the_plain_formula(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]  # TEST_AGENTS: no cache price
    lab.llm.push(_resp(ASK, prompt=1000, completion=200, cached=768))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    [call] = _calls(sid)
    assert call.cached_prompt_tokens == 768
    assert call.estimated_cost_usd == pytest.approx((1000 * 1.0 + 200 * 4.0) / 1e6)
    assert _session(sid).total_cached_prompt_tokens == 768


OSS_AGENTS = TEST_AGENTS.replace(
    "  test/new:",
    "  openai/gpt-oss-120b: { input_per_mtok: 0.037, output_per_mtok: 0.17, source: t, "
    'as_of: "2026-09-30" }\n  test/new:',
).replace(
    "agents:\n",
    "provider_order:\n  openai/gpt-oss-120b: [cerebras/fp16]\nagents:\n"
    '  - id: b-oss\n    display_name: "دکتر ۹"\n    architecture: structured\n'
    "    model: openai/gpt-oss-120b\n",
)


def test_provider_order_flows_from_snapshot_to_request(lab: Lab) -> None:
    from tests.lab import B_ASK

    _use_agents(lab, OSS_AGENTS)
    sid = lab.create("b-oss")["id"]
    assert loads(_session(sid).agent_snapshot_json)["provider_order"] == ["cerebras/fp16"]
    lab.llm.push(_resp(B_ASK, provider="Cerebras"))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    assert lab.llm.requests[-1].provider_order == ["cerebras/fp16"]
    # a reload that removes the order does not change the running session (B-015)
    _use_agents(
        lab, OSS_AGENTS.replace("provider_order:\n  openai/gpt-oss-120b: [cerebras/fp16]\n", "")
    )
    lab.llm.push(_resp(B_ASK))
    assert lab.send(sid, "از دیروز").status_code == 200
    assert lab.llm.requests[-1].provider_order == ["cerebras/fp16"]
    new_sid = lab.create("b-oss")["id"]
    lab.llm.push(_resp(B_ASK))
    assert lab.send(new_sid, "سردرد دارم").status_code == 200
    assert lab.llm.requests[-1].provider_order is None
    # other agents never carry an order
    sid2 = lab.create("a-simple")["id"]
    lab.llm.push(_resp(ASK))
    assert lab.send(sid2, "سردرد دارم").status_code == 200
    assert lab.llm.requests[-1].provider_order is None
    assert [c.provider for c in _calls(sid)] == ["Cerebras", None]


def test_export_includes_new_columns(lab: Lab) -> None:
    lab.user("boss", "admin")
    sid = lab.create("a-simple")["id"]
    lab.llm.push(_resp(ASK, cached=64, provider="DeepInfra"))
    assert lab.send(sid, "سردرد دارم").status_code == 200
    calls_csv = lab.req("GET", "/admin/export/llm_calls.csv", "boss")
    assert calls_csv.status_code == 200, calls_csv.text
    header = calls_csv.content.decode("utf-8-sig").splitlines()[0].split(",")
    assert "provider" in header and "cached_prompt_tokens" in header
    sessions_csv = lab.req("GET", "/admin/export/sessions.csv", "boss")
    assert "total_cached_prompt_tokens" in sessions_csv.content.decode("utf-8-sig").splitlines()[0]
