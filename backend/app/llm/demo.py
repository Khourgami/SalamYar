"""Offline demo LLM: answers every prompt with valid JSON so the API can be exercised end to end
without OpenRouter (used by `python -m app.dev_server`; never by the real app).

Behavior: asks until 2 patient messages were received, then concludes.
"""

import json
from typing import Any

from app.llm.client import LLMRequest, LLMResponse

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


class DemoLLM:
    async def complete(self, req: LLMRequest) -> LLMResponse:
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
        return LLMResponse(
            text=json.dumps(out, ensure_ascii=False),
            model_reported=f"demo/{req.model}",
            prompt_tokens=0,
            completion_tokens=0,
            reasoning_tokens=None,
            cost_usd=0.0,
            latency_ms=1,
            raw={"demo": True},
        )
