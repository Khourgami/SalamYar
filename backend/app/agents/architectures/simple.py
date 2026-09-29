"""Architecture A — `simple`: one LLM call per turn (BACKEND_ARCHITECTURE §6.1)."""

from app.agents.base import EndReason, SessionContext, TurnOutcome, make_request
from app.agents.clinical_schemas import SimpleTurn
from app.agents.guard import apply_guard
from app.agents.json_runner import AgentOutputError, run_json
from app.agents.prompts.loader import render
from app.llm.client import LLMClient, LLMMessage

FORCE_CONCLUDE_LINE = 'Conclude now. Set action to "conclude".'


class SimpleArchitecture:
    name = "simple"

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def build_messages(self, ctx: SessionContext, *, force: bool) -> list[LLMMessage]:
        messages = [
            LLMMessage(role="system", content=render("simple_system", ctx.config.prompt_version))
        ]
        for entry in ctx.transcript:
            role = "assistant" if entry.role == "agent" else "user"
            messages.append(LLMMessage(role=role, content=entry.text))
        if force:
            messages.append(LLMMessage(role="system", content=FORCE_CONCLUDE_LINE))
        return messages

    async def _call(self, ctx: SessionContext, *, force: bool) -> SimpleTurn:
        req = make_request(ctx.config, self.build_messages(ctx, force=force), SimpleTurn)
        turn, _ = await run_json(
            self.llm,
            req,
            SimpleTurn,
            purpose="assessment" if force else "turn",
            trace=ctx.trace,
            prompt_version=ctx.config.prompt_version,
        )
        return turn

    def _result(self, ctx: SessionContext, turn: SimpleTurn) -> TurnOutcome:
        assert turn.assessment is not None  # guaranteed by SimpleTurn validation
        final, report, text = apply_guard(turn.assessment, ctx.config.options)
        return TurnOutcome(
            kind="result",
            agent_message=text,
            backstage={"reasoning_note": turn.reasoning_note},
            assessment=final,
            raw_assessment=turn.assessment,
            guard_report=report,
        )

    async def next_turn(self, ctx: SessionContext) -> TurnOutcome:
        turn = await self._call(ctx, force=False)
        if turn.action == "ask":
            return TurnOutcome(
                kind="question",
                agent_message=turn.message_to_patient,
                backstage={"reasoning_note": turn.reasoning_note},
            )
        return self._result(ctx, turn)

    async def force_conclude(self, ctx: SessionContext, end_reason: EndReason) -> TurnOutcome:
        turn = await self._call(ctx, force=True)
        if turn.action != "conclude":
            raise AgentOutputError("model returned action 'ask' after being told to conclude")
        return self._result(ctx, turn)
