"""Call the LLM → strip fences → validate → one repair retry → trace (BACKEND_ARCHITECTURE §6.3)."""

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.agents.prompts.loader import render
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
    llm: LLMClient, req: LLMRequest, purpose: Purpose, attempt: int, trace: TraceFn
) -> LLMResponse:
    try:
        return await llm.complete(req)
    except LLMError as exc:
        trace(TraceRecord(purpose, attempt, req, None, False, str(exc)[:MAX_ERROR_CHARS]))
        raise


async def run_json[M: BaseModel](
    llm: LLMClient,
    req: LLMRequest,
    model_cls: type[M],
    *,
    purpose: Literal["turn", "assessment"],
    trace: TraceFn,
    prompt_version: str = "v1",
) -> tuple[M, list[LLMResponse]]:
    """Return the validated model and every LLM response used. Raises `AgentOutputError` after
    a failed repair, or `LLMError` when the transport fails (each attempt is traced first)."""
    first = await _call(llm, req, purpose, 1, trace)
    try:
        parsed = _parse(first.text, model_cls)
    except (ValidationError, ValueError) as exc:
        error = _error_text(exc)
        trace(TraceRecord(purpose, 1, req, first, False, error))
    else:
        trace(TraceRecord(purpose, 1, req, first, True, None))
        return parsed, [first]

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
    second = await _call(llm, repair_req, "repair", 2, trace)
    try:
        parsed = _parse(second.text, model_cls)
    except (ValidationError, ValueError) as exc:
        error2 = _error_text(exc)
        trace(TraceRecord("repair", 2, repair_req, second, False, error2))
        raise AgentOutputError(f"{model_cls.__name__} invalid after repair: {error2}") from exc
    trace(TraceRecord("repair", 2, repair_req, second, True, None))
    return parsed, [first, second]
