"""Builders for valid clinical JSON payloads used across tests."""

import json
from typing import Any


def hypothesis(name: str = "Migraine", p: float = 0.5) -> dict[str, Any]:
    return {
        "name_fa": "میگرن",
        "name_en": name,
        "probability": p,
        "supporting": ["throbbing"],
        "against": [],
    }


def cant_miss() -> dict[str, Any]:
    return {
        "name_fa": "خونریزی مغزی",
        "name_en": "Subarachnoid hemorrhage",
        "status": "not_excluded",
        "reason": "sudden onset not asked yet",
    }


def summary() -> dict[str, Any]:
    return {
        "chief_complaint": "سردرد",
        "history_of_present_illness": "از دیروز",
        "relevant_history": "ندارد",
        "medications": "ندارد",
        "allergies": "ندارد",
        "pertinent_negatives": "تب ندارد",
        "assessment_rationale": "احتمال میگرن",
    }


def assessment(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "triage_level": "ROUTINE_DAYS",
        "emergency_probability": 0.05,
        "specialty_primary": "neurology",
        "specialty_secondary": None,
        "differential": [hypothesis("Migraine", 0.6), hypothesis("Tension headache", 0.3)],
        "cant_miss": [cant_miss()],
        "missing_information": ["سابقه خانوادگی"],
        "confidence": "medium",
        "out_of_scope_pediatric": False,
        "patient_message": "لطفاً ظرف چند روز آینده به پزشک مغز و اعصاب مراجعه کنید.",
        "clinical_summary": summary(),
    }
    data.update(overrides)
    return data


def clinical_state(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {"age_years": 35, "sex": "male", "chief_complaint": "سردرد"}
    data.update(overrides)
    return data


def turn_decision(next_action: str = "ask", **overrides: Any) -> dict[str, Any]:
    asking = next_action in ("ask", "clarify")
    data: dict[str, Any] = {
        "clinical_state": clinical_state(),
        "hypotheses": [hypothesis("Migraine", 0.6)],
        "cant_miss": [cant_miss()],
        "emergency_probability": 0.05,
        "next_action": next_action,
        "stop_reason": None if asking else "enough_information",
        "question_rationale": "Discriminates SAH vs migraine." if asking else "",
        "message_to_patient": "سردرد ناگهانی شروع شد یا کم‌کم؟" if asking else "",
    }
    data.update(overrides)
    return data


def simple_turn(action: str = "ask", **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "action": action,
        "message_to_patient": "درد از کی شروع شد؟" if action == "ask" else "توصیه نهایی",
        "reasoning_note": "Leading: migraine.",
        "assessment": None if action == "ask" else assessment(),
    }
    data.update(overrides)
    return data


def js(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def evaluation(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "scores": {
            k: 4
            for k in (
                "triage_correctness",
                "referral_appropriateness",
                "efficiency",
                "question_quality",
                "history_completeness",
                "clinical_reasoning",
                "communication",
                "summary_usefulness",
                "overall_trust",
            )
        },
        "unnecessary_questions_count": 1,
        "safety_flags": {
            "dangerous_undertriage": False,
            "medication_or_treatment_advice": False,
            "definitive_diagnosis_claim": False,
            "medically_incorrect_information": False,
            "irrelevant_or_inappropriate_content": False,
        },
        "doctor_verdict": {
            "triage_level": "ROUTINE_DAYS",
            "specialty": "neurology",
            "main_diagnosis": "میگرن",
        },
        "comments": {
            "strengths": "سوالات خوب",
            "weaknesses": None,
            "missed_questions": None,
            "general": None,
        },
        "comparison": None,
    }
    data.update(overrides)
    return data
