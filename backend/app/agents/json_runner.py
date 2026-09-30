"""Call the LLM → strip fences → validate → one repair retry → trace (BACKEND_ARCHITECTURE §6.3).

Every call runs under the turn budget's total deadline and a repair needs ≥ 15 s left (D-038).
"""

import asyncio
import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.agents.prompts.loader import render
from app.llm.budget import DEADLINE_ERROR, DeadlineExceeded, TurnBudget
from app.llm.client import LLMClient, LLMError, LLMMessage, LLMRequest, LLMResponse

Purpose = Literal["turn", "assessment", "repair"]
MAX_ERROR_CHARS = 1500

_FENCE = re.compile(r"```(?:json|JSON)?\s*(.*?)```", re.S)


class AgentOutputError(Exception):
    """The model output could not be parsed/validated even after one repair retry."""


@dataclass(frozen=True)
class TraceRecord:
    purpose: Purpose
    attempt: int
    request: LLMRequest
    response: LLMResponse | None
    parsed_ok: bool
    error: str | None
    latency_ms: int | None = None  # wall time of an attempt without a response (error/deadline)


TraceFn = Callable[[TraceRecord], None]


def extract_json(text: str) -> str:
    """Strip ```json fences and anything before the first `{` / after the last `}`."""
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        return text.strip()
    return text[start : end + 1]


def _parse[M: BaseModel](text: str, model_cls: type[M]) -> M:
    return model_cls.model_validate_json(extract_json(text))


def _error_text(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        msg = str(exc)
    elif isinstance(exc, json.JSONDecodeError):
        msg = f"invalid JSON: {exc}"
    else:
        msg = f"{type(exc).__name__}: {exc}"
    return msg[:MAX_ERROR_CHARS]


async def _call(
    llm: LLMClient,
    req: LLMRequest,
    purpose: Purpose,
    attempt: int,
    trace: TraceFn,
    budget: TurnBudget,
) -> LLMResponse:
    """One logical call (the client's transport retry included) under a total deadline of
    `min(call deadline, remaining turn budget)`, covering the whole request and body."""
    timeout = budget.call_timeout()
    started = time.perf_counter()

    def elapsed_ms() -> int:
        return int((time.perf_counter() - started) * 1000)

    try:
        if timeout <= 0:
            raise TimeoutError
        async with asyncio.timeout(timeout):
            return await llm.complete(req, budget)
    except TimeoutError:
        latency = elapsed_ms()
        trace(TraceRecord(purpose, attempt, req, None, False, DEADLINE_ERROR, latency))
        raise DeadlineExceeded(
            f"{DEADLINE_ERROR}: {purpose} attempt {attempt} cut after {latency} ms "
            f"(call deadline {timeout:.1f} s)"
        ) from None
    except LLMError as exc:
        error = str(exc)[:MAX_ERROR_CHARS]
        trace(TraceRecord(purpose, attempt, req, None, False, error, elapsed_ms()))
        raise


async def run_json[M: BaseModel](
    llm: LLMClient,
    req: LLMRequest,
    model_cls: type[M],
    *,
    purpose: Literal["turn", "assessment"],
    trace: TraceFn,
    prompt_version: str = "v1",
    budget: TurnBudget | None = None,
) -> tuple[M, list[LLMResponse]]:
    """Return the validated model and every LLM response used. Raises `AgentOutputError` after
    a failed repair, or `LLMError` when the transport fails (each attempt is traced first);
    `DeadlineExceeded` (an `LLMError`) when the turn budget runs out or is too short to repair."""
    budget = budget if budget is not None else TurnBudget()
    first = await _call(llm, req, purpose, 1, trace, budget)
    try:
        parsed = _parse(first.text, model_cls)
    except (ValidationError, ValueError) as exc:
        error = _error_text(exc)
        trace(TraceRecord(purpose, 1, req, first, False, error))
    else:
        trace(TraceRecord(purpose, 1, req, first, True, None))
        return parsed, [first]

    budget.require_follow_up("repair")
    repair_req = req.model_copy(
        update={
            "messages": [
                *req.messages,
                LLMMessage(role="assistant", content=first.text),
                LLMMessage(
                    role="user",
                    content=render("repair", prompt_version, validation_error=error),
                ),
            ]
        }
    )
    second = await _call(llm, repair_req, "repair", 2, trace, budget)
    try:
        parsed = _parse(second.text, model_cls)
    except (ValidationError, ValueError) as exc:
        error2 = _error_text(exc)
        trace(TraceRecord("repair", 2, repair_req, second, False, error2))
        raise AgentOutputError(f"{model_cls.__name__} invalid after repair: {error2}") from exc
    trace(TraceRecord("repair", 2, repair_req, second, True, None))
    return parsed, [first, second]
