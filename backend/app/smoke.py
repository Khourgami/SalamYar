"""Real-model smoke test (BACKEND_ARCHITECTURE §9): verify slugs and run a scripted conversation
through the real architecture objects, in memory (no DB, no HTTP server).

This is the only code path that calls OpenRouter outside the running app. Not part of pytest.
"""

import time
from collections.abc import Sequence
from dataclasses import dataclass, field

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
ERROR_WIDTH = 60


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

    @property
    def ok(self) -> bool:
        return self.model_found is not False and self.conclude == "y" and not self.error


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


async def run_agent(config: AgentConfig, llm: LLMClient) -> SmokeResult:
    res = SmokeResult(agent_id=config.id, model=config.model)
    ctx = SessionContext(
        config=config,
        transcript=[TranscriptEntry(role="agent", text=GREETING_FA)],
        trace=res.traces.append,
    )
    arch = build_architecture(config, llm)
    started = time.perf_counter()
    step = "turn1"
    try:
        outcome: TurnOutcome | None = None
        for step, text in zip(("turn1", "turn2"), PATIENT_MESSAGES, strict=True):
            ctx.transcript.append(TranscriptEntry(role="patient", text=text))
            outcome = await arch.next_turn(ctx)
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
            await arch.force_conclude(ctx, "evaluator_ended")
        res.conclude = "y"
    except (AgentOutputError, LLMError) as exc:
        setattr(res, step, "n")
        res.error = f"{type(exc).__name__}: {exc}"
    res.latency_ms = int((time.perf_counter() - started) * 1000)
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
                    agent_id=cfg.id, model=cfg.model, model_found=False, error="model not found"
                )
            )
            continue
        res = await run_agent(cfg, llm)
        res.model_found = None if available is None else True
        results.append(res)
    return results


def _yn(value: bool | None) -> str:
    return "?" if value is None else ("y" if value else "n")


def format_table(results: Sequence[SmokeResult]) -> str:
    header = [
        "agent",
        "model",
        "found",
        "turn1",
        "turn2",
        "conclude",
        "repairs",
        "latency_s",
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


def exit_code(results: Sequence[SmokeResult]) -> int:
    return 0 if results and all(r.ok for r in results) else 1
