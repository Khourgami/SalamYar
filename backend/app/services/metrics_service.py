"""Admin dashboard metrics (PRD §9, BACKEND_ARCHITECTURE §10, API_CONTRACT §7)."""

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from statistics import fmean
from typing import Any, Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.types import loads, utcnow

GroupBy = Literal["agent", "architecture", "model"]

TRIAGE_ORDER = {"EMERGENCY_NOW": 4, "URGENT_24H": 3, "ROUTINE_DAYS": 2, "SELF_CARE": 1}
INSUFFICIENT = "INSUFFICIENT_INFO"
SCORE_KEYS = (
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
SAFETY_FLAG_KEYS = (
    "dangerous_undertriage",
    "medication_or_treatment_advice",
    "definitive_diagnosis_claim",
    "medically_incorrect_information",
    "irrelevant_or_inappropriate_content",
)


class Pairwise(BaseModel):
    wins: int = 0
    losses: int = 0
    ties: int = 0


class MetricsRow(BaseModel):
    key: str
    label: str
    architecture: str | None
    model: str | None
    sessions_total: int
    sessions_evaluated: int
    triage_exact_rate: float | None
    undertriage_rate: float | None
    undertriage_emergency_rate: float | None
    overtriage_rate: float | None
    insufficient_info_count: int
    specialty_match_rate: float | None
    mean_scores: dict[str, float | None]
    safety_flag_counts: dict[str, int]
    mean_questions: float | None
    turn_latency_p50_ms: float | None
    turn_latency_p90_ms: float | None
    mean_cost_usd: float | None
    total_cost_usd: float | None  # v1.2 (D-035)
    mean_llm_calls: float | None
    mean_prompt_tokens: float | None
    mean_completion_tokens: float | None
    mean_reasoning_tokens: float | None
    feedback_up: int
    feedback_down: int
    pairwise: Pairwise
    safety_floor_escalations: int


class MetricsResponse(BaseModel):
    group_by: GroupBy
    rows: list[MetricsRow]
    generated_at: datetime


def percentile(values: list[int] | list[float], p: float) -> float | None:
    """Nearest-rank percentile (p in 0..100)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return float(ordered[rank - 1])


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _mean(values: list[float] | list[int]) -> float | None:
    return fmean(values) if values else None


def _present[T](values: list[T | None]) -> list[T]:
    return [v for v in values if v is not None]


@dataclass
class _SessionFacts:
    sess: m.Session
    snapshot: dict[str, Any]
    assessment: dict[str, Any] | None = None
    guard: dict[str, Any] | None = None
    evaluation: dict[str, Any] | None = None
    latencies: list[int] = field(default_factory=list)
    feedback_up: int = 0
    feedback_down: int = 0


def _load(db: Session) -> dict[str, _SessionFacts]:
    facts = {
        s.id: _SessionFacts(sess=s, snapshot=loads(s.agent_snapshot_json))
        for s in db.scalars(select(m.Session))
    }
    for a in db.scalars(select(m.Assessment)):
        facts[a.session_id].assessment = loads(a.result_json)
        facts[a.session_id].guard = loads(a.guard_report_json)
    for e in db.scalars(select(m.Evaluation)):
        facts[e.session_id].evaluation = loads(e.data_json)
    for session_id, latency in db.execute(
        select(m.Message.session_id, m.Message.latency_ms).where(
            m.Message.role == "agent",
            m.Message.kind.in_(("question", "result")),
            m.Message.latency_ms.is_not(None),
        )
    ):
        facts[session_id].latencies.append(latency)
    for session_id, rating in db.execute(
        select(m.Message.session_id, m.MessageFeedback.rating).join(
            m.Message, m.Message.id == m.MessageFeedback.message_id
        )
    ):
        if rating == "up":
            facts[session_id].feedback_up += 1
        else:
            facts[session_id].feedback_down += 1
    return facts


def _key(f: _SessionFacts, group_by: GroupBy) -> str:
    if group_by == "agent":
        return f.sess.agent_id
    return str(f.snapshot[group_by])


def _row(
    key: str,
    label: str,
    architecture: str | None,
    model: str | None,
    group: list[_SessionFacts],
    pairwise: Pairwise,
) -> MetricsRow:
    completed = [f for f in group if f.assessment is not None]
    evaluated = [f for f in completed if f.evaluation is not None]

    rated: list[tuple[str, str]] = []  # (final, verdict), both not INSUFFICIENT_INFO
    specialty_hits = 0
    for f in evaluated:
        assert f.assessment is not None and f.evaluation is not None
        final = f.assessment["triage_level"]
        verdict = f.evaluation["doctor_verdict"]["triage_level"]
        if final != INSUFFICIENT and verdict != INSUFFICIENT:
            rated.append((final, verdict))
        specialties = {f.assessment["specialty_primary"], f.assessment["specialty_secondary"]}
        if f.evaluation["doctor_verdict"]["specialty"] in specialties:
            specialty_hits += 1
    under = sum(TRIAGE_ORDER[fin] < TRIAGE_ORDER[ver] for fin, ver in rated)
    over = sum(TRIAGE_ORDER[fin] > TRIAGE_ORDER[ver] for fin, ver in rated)
    exact = sum(fin == ver for fin, ver in rated)
    emergency = [(fin, ver) for fin, ver in rated if ver == "EMERGENCY_NOW"]
    emergency_under = sum(TRIAGE_ORDER[fin] < TRIAGE_ORDER[ver] for fin, ver in emergency)

    evaluations = [f.evaluation for f in evaluated if f.evaluation is not None]
    latencies = [lat for f in group for lat in f.latencies]
    costs = _present([f.sess.total_cost_usd for f in completed])
    return MetricsRow(
        key=key,
        label=label,
        architecture=architecture,
        model=model,
        sessions_total=len(group),
        sessions_evaluated=len(evaluated),
        triage_exact_rate=_rate(exact, len(rated)),
        undertriage_rate=_rate(under, len(rated)),
        undertriage_emergency_rate=_rate(emergency_under, len(emergency)),
        overtriage_rate=_rate(over, len(rated)),
        insufficient_info_count=sum(
            1 for f in completed if f.assessment and f.assessment["triage_level"] == INSUFFICIENT
        ),
        specialty_match_rate=_rate(specialty_hits, len(evaluated)),
        mean_scores={k: _mean([e["scores"][k] for e in evaluations]) for k in SCORE_KEYS},
        safety_flag_counts={
            k: sum(1 for e in evaluations if e["safety_flags"][k]) for k in SAFETY_FLAG_KEYS
        },
        mean_questions=_mean([f.sess.questions_asked for f in completed]),
        turn_latency_p50_ms=percentile(latencies, 50),
        turn_latency_p90_ms=percentile(latencies, 90),
        mean_cost_usd=_mean(costs),
        total_cost_usd=sum(costs) if costs else None,
        mean_llm_calls=_mean([f.sess.llm_call_count for f in completed]),
        mean_prompt_tokens=_mean(_present([f.sess.total_prompt_tokens for f in completed])),
        mean_completion_tokens=_mean(_present([f.sess.total_completion_tokens for f in completed])),
        mean_reasoning_tokens=_mean(_present([f.sess.total_reasoning_tokens for f in completed])),
        feedback_up=sum(f.feedback_up for f in group),
        feedback_down=sum(f.feedback_down for f in group),
        pairwise=pairwise,
        safety_floor_escalations=sum(
            1 for f in completed if f.guard and "safety_floor_escalation" in f.guard["actions"]
        ),
    )


def compute_metrics(db: Session, group_by: GroupBy = "agent") -> MetricsResponse:
    facts = _load(db)
    groups: dict[str, list[_SessionFacts]] = defaultdict(list)
    for f in facts.values():
        groups[_key(f, group_by)].append(f)

    # Every enabled agent (or its architecture/model) gets a row, even without sessions.
    agents = {a.id: a for a in db.scalars(select(m.Agent))}
    for a in agents.values():
        if a.enabled:
            groups.setdefault(
                {"agent": a.id, "architecture": a.architecture, "model": a.model}[group_by], []
            )

    pairwise: dict[str, Pairwise] = defaultdict(Pairwise)
    for f in facts.values():
        comparison = (f.evaluation or {}).get("comparison")
        if not comparison:
            continue
        other = facts.get(comparison["compared_session_id"])
        if other is None:
            continue
        this_key, other_key = _key(f, group_by), _key(other, group_by)
        if this_key == other_key:
            continue
        winner = comparison["winner"]
        if winner == "this":
            pairwise[this_key].wins += 1
            pairwise[other_key].losses += 1
        elif winner == "other":
            pairwise[this_key].losses += 1
            pairwise[other_key].wins += 1
        else:
            pairwise[this_key].ties += 1
            pairwise[other_key].ties += 1

    rows = []
    for key in sorted(groups):
        group = groups[key]
        if group_by == "agent":
            agent = agents.get(key)
            snap = group[0].snapshot if group else {}
            label = agent.display_name if agent else snap.get("display_name", key)
            architecture = agent.architecture if agent else snap.get("architecture")
            model = agent.model if agent else snap.get("model")
        elif group_by == "architecture":
            label, architecture, model = key, key, None
        else:
            label, architecture, model = key, None, key
        rows.append(_row(key, label, architecture, model, group, pairwise[key]))
    return MetricsResponse(group_by=group_by, rows=rows, generated_at=utcnow())
