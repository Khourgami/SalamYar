"""Scripted LLM for tests: returns queued responses (or raises queued exceptions)."""

from collections.abc import Iterable

from app.llm.client import LLMRequest, LLMResponse

FAKE_COST_USD = 0.001


class FakeLLM:
    def __init__(self, responses: Iterable[str | BaseException] = ()) -> None:
        self.responses: list[str | BaseException] = list(responses)
        self.requests: list[LLMRequest] = []

    def push(self, *responses: str | BaseException) -> None:
        self.responses.extend(responses)

    async def complete(self, req: LLMRequest) -> LLMResponse:
        self.requests.append(req.model_copy(deep=True))
        if not self.responses:
            raise AssertionError("FakeLLM: no scripted response left")
        item = self.responses.pop(0)
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
