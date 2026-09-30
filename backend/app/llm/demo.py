"""Offline demo LLM: answers every prompt with valid JSON so the API can be exercised end to end
without OpenRouter (used by `python -m app.dev_server`; never by the real app).

Behavior: asks until 2 patient messages were received, then concludes.

Dev-server extras (D-029): an optional per-call delay (async sleep) and a one-shot failure
trigger — the first time a transcript whose last patient message contains «خطا» is processed,
every attempt (including the repair) returns invalid JSON, so the turn ends in 502 AGENT_ERROR;
the resend of the same transcript is answered normally. The "seen" key is the session id (from
`current_session_id`, set by the dev server's ASGI wrapper; "" if unset) plus a hash of the
transcript.
"""

import asyncio
import hashlib
import json
from contextvars import ContextVar
from typing import Any

from app.llm.budget import TurnBudget
from app.llm.client import LLMMessage, LLMRequest, LLMResponse

FAILURE_TRIGGER = "خطا"
INVALID_OUTPUT = "demo: deliberately invalid output (failure trigger «خطا»)"

current_session_id: ContextVar[str] = ContextVar("demo_session_id", default="")

# Fixed, plausible usage per call (phase 2c T5) so tokens and cost show up end to end.
DEMO_PROMPT_TOKENS = 1500
DEMO_COMPLETION_TOKENS = 300
DEMO_REASONING_TOKENS = 60  # part of the completion tokens, as with the real providers (B-043)
DEMO_COST_USD = 0.002

_HYPOTHESIS = {
    "name_fa": "سردرد تنشی",
    "name_en": "Tension-type headache",
    "probability": 0.6,
    "supporting": ["gradual onset"],
    "against": [],
}
_CANT_MISS = {
    "name_fa": "خونریزی زیر عنکبوتیه",
    "name_en": "Subarachnoid hemorrhage",
    "status": "ruled_out",
    "reason": "gradual onset, moderate severity",
}
_ASSESSMENT: dict[str, Any] = {
    "triage_level": "ROUTINE_DAYS",
    "emergency_probability": 0.05,
    "specialty_primary": "general_practice",
    "specialty_secondary": "neurology",
    "differential": [_HYPOTHESIS],
    "cant_miss": [_CANT_MISS],
    "missing_information": ["سابقه مصرف دارو"],
    "confidence": "medium",
    "out_of_scope_pediatric": False,
    "patient_message": "لطفاً ظرف چند روز آینده به پزشک عمومی مراجعه کنید. (پاسخ آزمایشی)",
    "clinical_summary": {
        "chief_complaint": "سردرد",
        "history_of_present_illness": "سردرد از دیروز، تدریجی",
        "relevant_history": "نامشخص",
        "medications": "نامشخص",
        "allergies": "نامشخص",
        "pertinent_negatives": "ندارد",
        "assessment_rationale": "پاسخ آزمایشی (demo LLM)",
    },
}
_QUESTION = "درد از کی شروع شد و از ۱ تا ۱۰ چقدر است؟ (پاسخ آزمایشی)"


def _conversation(messages: list[LLMMessage]) -> list[LLMMessage]:
    """The request messages without a repair tail (our own invalid output and what follows)."""
    for i, msg in enumerate(messages):
        if msg.role == "assistant" and msg.content == INVALID_OUTPUT:
            return messages[:i]
    return messages


def _transcript(messages: list[LLMMessage]) -> list[tuple[str, str]]:
    """(role, text) pairs of the patient conversation, for both architectures."""
    if len(messages) >= 2 and messages[1].role == "user":
        try:
            payload = json.loads(messages[1].content)
        except ValueError:
            payload = None
        if isinstance(payload, dict) and isinstance(payload.get("transcript"), list):
            return [(str(t.get("role")), str(t.get("text"))) for t in payload["transcript"]]
    return [
        ("patient" if m.role == "user" else "agent", m.content)
        for m in messages
        if m.role in ("user", "assistant")
    ]


class DemoLLM:
    def __init__(self, delay_ms: int = 0) -> None:
        self.delay_ms = delay_ms
        self.failed_once: set[tuple[str, str]] = set()

    def _should_fail(self, req: LLMRequest) -> bool:
        conversation = _conversation(req.messages)
        if len(conversation) < len(req.messages):
            return True  # repair attempt of a deliberate failure: fail again
        transcript = _transcript(conversation)
        patient = [text for role, text in transcript if role == "patient"]
        if not patient or FAILURE_TRIGGER not in patient[-1]:
            return False
        digest = hashlib.sha256(json.dumps(transcript, ensure_ascii=False).encode()).hexdigest()
        key = (current_session_id.get(), digest)
        if key in self.failed_once:
            return False
        self.failed_once.add(key)
        return True

    async def complete(self, req: LLMRequest, budget: TurnBudget | None = None) -> LLMResponse:
        if self.delay_ms > 0:
            await asyncio.sleep(self.delay_ms / 1000)
        if self._should_fail(req):
            return self._response(req, INVALID_OUTPUT)
        return self._response(req, json.dumps(self._answer(req), ensure_ascii=False))

    @staticmethod
    def _response(req: LLMRequest, text: str) -> LLMResponse:
        return LLMResponse(
            text=text,
            model_reported=f"demo/{req.model}",
            prompt_tokens=DEMO_PROMPT_TOKENS,
            completion_tokens=DEMO_COMPLETION_TOKENS,
            reasoning_tokens=DEMO_REASONING_TOKENS,
            cost_usd=DEMO_COST_USD,
            latency_ms=1,
            raw={"demo": True},
        )

    @staticmethod
    def _answer(req: LLMRequest) -> dict[str, Any]:
        system = req.messages[0].content
        if "YOUR TASK THIS TURN" in system:
            payload = json.loads(req.messages[1].content)
            patient_turns = sum(1 for t in payload["transcript"] if t["role"] == "patient")
            ask = patient_turns < 2
            out: dict[str, Any] = {
                "clinical_state": {"chief_complaint": "سردرد"},
                "hypotheses": [_HYPOTHESIS],
                "cant_miss": [_CANT_MISS],
                "emergency_probability": 0.05,
                "next_action": "ask" if ask else "conclude",
                "stop_reason": None if ask else "enough_information",
                "question_rationale": "Demo question." if ask else "",
                "message_to_patient": _QUESTION if ask else "",
            }
        elif "The history taking is finished" in system:
            out = _ASSESSMENT
        else:  # simple architecture
            patient_turns = sum(1 for m in req.messages if m.role == "user")
            forced = req.messages[-1].role == "system"
            ask = patient_turns < 3 and not forced
            out = {
                "action": "ask" if ask else "conclude",
                "message_to_patient": _QUESTION if ask else _ASSESSMENT["patient_message"],
                "reasoning_note": "Demo reasoning.",
                "assessment": None if ask else _ASSESSMENT,
            }
        return out
