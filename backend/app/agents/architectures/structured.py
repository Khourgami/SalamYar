"""Architecture B — `structured`: one call per turn + one final assessment call (§6.2)."""

import json
from typing import Any

from app.agents.base import EndReason, SessionContext, TurnOutcome, make_request
from app.agents.clinical_schemas import AssessmentResult, ClinicalState, TurnDecision
from app.agents.guard import apply_guard
from app.agents.json_runner import run_json
from app.agents.prompts.loader import render
from app.llm.client import LLMClient, LLMMessage


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


class StructuredArchitecture:
    name = "structured"

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    @staticmethod
    def _transcript(ctx: SessionContext) -> list[dict[str, str]]:
        return [e.model_dump() for e in ctx.transcript]

    def turn_payload(self, ctx: SessionContext) -> dict[str, Any]:
        return {
            "clinical_state": (ctx.clinical_state or ClinicalState()).model_dump(mode="json"),
            "previous_hypotheses": [h.model_dump(mode="json") for h in ctx.previous_hypotheses],
            "questions_asked": ctx.questions_asked,
            "max_questions": ctx.config.options.max_questions,
            "transcript": self._transcript(ctx),
        }

    async def next_turn(self, ctx: SessionContext) -> TurnOutcome:
        cfg = ctx.config
        messages = [
            LLMMessage(role="system", content=render("structured_turn_system", cfg.prompt_version)),
            LLMMessage(role="user", content=_json(self.turn_payload(ctx))),
        ]
        decision, _ = await run_json(
            self.llm,
            make_request(cfg, messages, TurnDecision),
            TurnDecision,
            purpose="turn",
            trace=ctx.trace,
            prompt_version=cfg.prompt_version,
            budget=ctx.budget,
        )
        # Always persist the new (full-replacement) clinical state right after the turn call.
        ctx.clinical_state = decision.clinical_state
        ctx.save_clinical_state(decision.clinical_state)

        backstage = decision.model_dump(mode="json", exclude={"message_to_patient"})
        if decision.next_action in ("ask", "clarify"):
            return TurnOutcome(
                kind="question", agent_message=decision.message_to_patient, backstage=backstage
            )
        # D-038: the turn and assessment calls share one budget; the state above stays saved
        ctx.budget.require_follow_up("assessment call")
        return await self._assess(ctx, "agent_concluded", backstage)

    async def force_conclude(self, ctx: SessionContext, end_reason: EndReason) -> TurnOutcome:
        return await self._assess(ctx, end_reason, {"next_action": "conclude", "stop_reason": None})

    async def _assess(
        self, ctx: SessionContext, end_reason: EndReason, backstage: dict[str, Any]
    ) -> TurnOutcome:
        cfg = ctx.config
        payload = {
            "clinical_state": (ctx.clinical_state or ClinicalState()).model_dump(mode="json"),
            "transcript": self._transcript(ctx),
            "end_reason": end_reason,
        }
        system = render("structured_assessment_system", cfg.prompt_version, end_reason=end_reason)
        messages = [
            LLMMessage(role="system", content=system),
            LLMMessage(role="user", content=_json(payload)),
        ]
        raw, _ = await run_json(
            self.llm,
            make_request(cfg, messages, AssessmentResult),
            AssessmentResult,
            purpose="assessment",
            trace=ctx.trace,
            prompt_version=cfg.prompt_version,
            budget=ctx.budget,
        )
        final, report, text = apply_guard(raw, cfg.options)
        return TurnOutcome(
            kind="result",
            agent_message=text,
            backstage=backstage,
            assessment=final,
            raw_assessment=raw,
            guard_report=report,
        )
