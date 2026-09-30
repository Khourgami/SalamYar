"""Scripted LLM for tests: returns queued responses (or raises queued exceptions)."""

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass

from app.llm.budget import TurnBudget
from app.llm.client import LLMRequest, LLMResponse

FAKE_COST_USD = 0.001


@dataclass(frozen=True)
class Slow:
    """A scripted item that is returned (or raised) only after `seconds` of real waiting."""

    seconds: float
    item: str | BaseException


Scripted = str | BaseException | Slow


class FakeLLM:
    def __init__(self, responses: Iterable[Scripted] = ()) -> None:
        self.responses: list[Scripted] = list(responses)
        self.requests: list[LLMRequest] = []
        self.budgets: list[TurnBudget | None] = []

    def push(self, *responses: Scripted) -> None:
        self.responses.extend(responses)

    async def complete(self, req: LLMRequest, budget: TurnBudget | None = None) -> LLMResponse:
        self.requests.append(req.model_copy(deep=True))
        self.budgets.append(budget)
        if not self.responses:
            raise AssertionError("FakeLLM: no scripted response left")
        item = self.responses.pop(0)
        if isinstance(item, Slow):
            await asyncio.sleep(item.seconds)
            item = item.item
        if isinstance(item, BaseException):
            raise item
        return LLMResponse(
            text=item,
            model_reported=req.model,
            prompt_tokens=100,
            completion_tokens=50,
            reasoning_tokens=None,
            cost_usd=FAKE_COST_USD,
            latency_ms=5,
            raw={"fake": True},
        )
