"""Real-model smoke test (BACKEND_ARCHITECTURE §9): verify slugs and run a scripted conversation
through the real architecture objects, in memory (no DB, no HTTP server).

This is the only code path that calls OpenRouter outside the running app. Not part of pytest.
"""

import json
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from app.agents.architectures import build_architecture
from app.agents.base import SessionContext, TranscriptEntry, TurnOutcome
from app.agents.clinical_schemas import Hypothesis
from app.agents.config import AgentConfig
from app.agents.json_runner import AgentOutputError, TraceRecord
from app.agents.texts_fa import GREETING_FA
from app.llm.client import LLMClient, LLMError

PATIENT_MESSAGES = (
    "از دیروز سردرد دارم",
    "مرد هستم، ۳۵ سالمه. درد حدود ۵ از ۱۰ است و کم‌کم شروع شد.",
)
STEPS = ("turn1", "turn2", "conclude")
ERROR_WIDTH = 60
JSON_TEXT_LIMIT = 500  # error text / failed-output excerpts in the --json file


@dataclass
class SmokeResult:
    agent_id: str
    model: str
    model_found: bool | None = None  # None = not checked
    turn1: str = "-"  # "y" | "n" | "-" (not run)
    turn2: str = "-"
    conclude: str = "-"
    repairs: int = 0
    latency_ms: int = 0
    cost_usd: float | None = None
    error: str = ""
    traces: list[TraceRecord] = field(default_factory=list, repr=False)
    # wall-clock latency of each scripted step that ran (turn1, turn2, conclude)
    turn_latencies_ms: dict[str, int] = field(default_factory=dict)
    trace_steps: list[str] = field(default_factory=list, repr=False)  # step of each trace
    result_step: str | None = None  # the step that produced the result card
    replies: dict[str, str] = field(default_factory=dict)  # Persian text shown per step
    triage_level: str | None = None  # final (post-guard) level
    config: AgentConfig | None = field(default=None, repr=False)

    @property
    def ok(self) -> bool:
        return self.model_found is not False and self.conclude == "y" and not self.error

    @property
    def llm_calls(self) -> int:
        return len(self.traces)

    @property
    def mean_turn_ms(self) -> float | None:
        values = list(self.turn_latencies_ms.values())
        return sum(values) / len(values) if values else None

    @property
    def max_turn_ms(self) -> int | None:
        return max(self.turn_latencies_ms.values(), default=None)


async def fetch_model_ids(
    base_url: str, api_key: str, *, transport: httpx.AsyncBaseTransport | None = None
) -> set[str]:
    async with httpx.AsyncClient(timeout=30, transport=transport) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}/models", headers={"Authorization": f"Bearer {api_key}"}
        )
    if resp.status_code != 200:
        raise LLMError(f"GET /models failed: HTTP {resp.status_code}")
    return {m["id"] for m in resp.json().get("data", [])}


async def run_agent(
    config: AgentConfig, llm: LLMClient, *, clock: Callable[[], float] = time.perf_counter
) -> SmokeResult:
    res = SmokeResult(agent_id=config.id, model=config.model, config=config)
    step = "turn1"

    def trace(record: TraceRecord) -> None:
        res.traces.append(record)
        res.trace_steps.append(step)

    ctx = SessionContext(
        config=config,
        transcript=[TranscriptEntry(role="agent", text=GREETING_FA)],
        trace=trace,
    )
    arch = build_architecture(config, llm)
    started = clock()
    step_started = started

    def finish_step(outcome: TurnOutcome | None) -> None:
        res.turn_latencies_ms[step] = int((clock() - step_started) * 1000)
        if outcome is not None:
            res.replies[step] = outcome.agent_message
            if outcome.kind == "result":
                res.result_step = step
                res.triage_level = outcome.assessment.triage_level if outcome.assessment else None

    try:
        outcome: TurnOutcome | None = None
        for step, text in zip(("turn1", "turn2"), PATIENT_MESSAGES, strict=True):
            ctx.transcript.append(TranscriptEntry(role="patient", text=text))
            step_started = clock()
            outcome = await arch.next_turn(ctx)
            finish_step(outcome)
            setattr(res, step, "y")
            if outcome.kind == "result":
                break
            ctx.transcript.append(TranscriptEntry(role="agent", text=outcome.agent_message))
            ctx.questions_asked += 1
            # architecture B: previous hypotheses come from the last turn's backstage
            if "hypotheses" in outcome.backstage:
                ctx.previous_hypotheses = [
                    Hypothesis.model_validate(h) for h in outcome.backstage["hypotheses"]
                ]
        step = "conclude"
        if outcome is None or outcome.kind != "result":
            step_started = clock()
            finish_step(await arch.force_conclude(ctx, "evaluator_ended"))
        res.conclude = "y"
    except (AgentOutputError, LLMError) as exc:
        res.turn_latencies_ms[step] = int((clock() - step_started) * 1000)
        setattr(res, step, "n")
        res.error = f"{type(exc).__name__}: {exc}"
    res.latency_ms = int((clock() - started) * 1000)
    res.repairs = sum(1 for t in res.traces if t.purpose == "repair")
    costs = [
        t.response.cost_usd for t in res.traces if t.response and t.response.cost_usd is not None
    ]
    res.cost_usd = sum(costs) if costs else None
    return res


async def smoke_test(
    configs: Sequence[AgentConfig], llm: LLMClient, available: set[str] | None
) -> list[SmokeResult]:
    results = []
    for cfg in configs:
        if available is not None and cfg.model not in available:
            results.append(
                SmokeResult(
                    agent_id=cfg.id,
                    model=cfg.model,
                    model_found=False,
                    error="model not found",
                    config=cfg,
                )
            )
            continue
        res = await run_agent(cfg, llm)
        res.model_found = None if available is None else True
        results.append(res)
    return results


def _yn(value: bool | None) -> str:
    return "?" if value is None else ("y" if value else "n")


def _secs(ms: float | None) -> str:
    return "-" if ms is None else f"{ms / 1000:.1f}"


def format_table(results: Sequence[SmokeResult]) -> str:
    header = [
        "agent",
        "model",
        "found",
        "turn1",
        "turn2",
        "conclude",
        "t1_s",
        "t2_s",
        "concl_s",
        "mean_s",
        "max_s",
        "calls",
        "repairs",
        "total_s",
        "cost_usd",
        "error",
    ]
    rows = [
        [
            r.agent_id,
            r.model,
            _yn(r.model_found),
            r.turn1,
            r.turn2,
            r.conclude,
            *(_secs(r.turn_latencies_ms.get(s)) for s in STEPS),
            _secs(r.mean_turn_ms),
            _secs(r.max_turn_ms),
            str(r.llm_calls),
            str(r.repairs),
            f"{r.latency_ms / 1000:.1f}",
            "-" if r.cost_usd is None else f"{r.cost_usd:.5f}",
            (r.error[: ERROR_WIDTH - 1] + "…") if len(r.error) > ERROR_WIDTH else r.error,
        ]
        for r in results
    ]
    widths = [max(len(row[i]) for row in [header, *rows]) for i in range(len(header))]
    lines = [
        "| " + " | ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)) + " |"
        for row in [header, *rows]
    ]
    lines.insert(1, "|" + "|".join("-" * (w + 2) for w in widths) + "|")
    return "\n".join(lines)


def _clip(text: str | None) -> str | None:
    return None if text is None else text[:JSON_TEXT_LIMIT]


def result_to_dict(r: SmokeResult) -> dict[str, Any]:
    """One agent as a JSON-able dict (the `--json` file format)."""
    cfg = r.config
    calls = []
    for step, t in zip(r.trace_steps, r.traces, strict=True):
        resp = t.response
        calls.append(
            {
                "step": step,
                "purpose": t.purpose,
                "attempt": t.attempt,
                "parsed_ok": t.parsed_ok,
                "latency_ms": resp.latency_ms if resp else None,
                "cost_usd": resp.cost_usd if resp else None,
                "prompt_tokens": resp.prompt_tokens if resp else None,
                "completion_tokens": resp.completion_tokens if resp else None,
                "reasoning_tokens": resp.reasoning_tokens if resp else None,
                "model_reported": resp.model_reported if resp else None,
                "error": _clip(t.error),
                # the raw output only when it failed validation (trace excerpt for the report)
                "output_excerpt": _clip(resp.text) if resp and not t.parsed_ok else None,
            }
        )
    return {
        "agent_id": r.agent_id,
        "model": r.model,
        "architecture": cfg.architecture if cfg else None,
        "output_mode": cfg.output_mode if cfg else None,
        "send_temperature": cfg.send_temperature if cfg else None,
        "reasoning_effort": cfg.reasoning_effort if cfg else None,
        "enabled": cfg.enabled if cfg else None,
        "model_found": r.model_found,
        "ok": r.ok,
        "steps": {s: getattr(r, s) for s in STEPS},
        "turn_latency_ms": dict(r.turn_latencies_ms),
        "mean_turn_latency_ms": r.mean_turn_ms,
        "max_turn_latency_ms": r.max_turn_ms,
        "total_latency_ms": r.latency_ms,
        "result_step": r.result_step,
        "triage_level": r.triage_level,
        "llm_calls": r.llm_calls,
        "repair_calls": r.repairs,
        "cost_usd": r.cost_usd,
        "error": _clip(r.error) or None,
        "call_errors": [c["error"] for c in calls if c["error"]],
        "calls": calls,
        "replies": dict(r.replies),
    }


def write_json(results: Sequence[SmokeResult], path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = [result_to_dict(r) for r in results]
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def exit_code(results: Sequence[SmokeResult]) -> int:
    return 0 if results and all(r.ok for r in results) else 1
