"""`cost-report` CLI data (D-035): tokens and cost per session, agent, model or architecture.

Reads the DB only. Reported cost (`usage.cost`) is the truth; the estimate is shown next to it,
with the relative difference computed over the calls that carry both values.
"""

import csv
import io
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import fmean, median
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.types import loads

GroupBy = Literal["session", "agent", "model", "architecture", "provider"]
StatusFilter = Literal["completed", "all"]
DIFF_THRESHOLD = 0.15  # mark rows whose |estimated − reported| / reported exceeds 15 %
FLAG = ">15%"

GROUP_HEADER = [
    "key",
    "sessions",
    "llm_calls",
    "repair_calls",
    "prompt_tokens",
    "prompt_mean",
    "completion_tokens",
    "completion_mean",
    "reasoning_tokens",
    "reasoning_mean",
    "cached_prompt_tokens",
    "cached_prompt_mean",
    "reported_usd",
    "reported_mean",
    "reported_median",
    "reported_max",
    "estimated_usd",
    "estimated_mean",
    "diff_pct",
    "flag",
]
SESSION_HEADER = [
    "session_id",
    "agent_id",
    "model",
    "architecture",
    "status",
    "end_reason",
    "questions",
    "final_triage_level",
    "llm_calls",
    "prompt_tokens",
    "completion_tokens",
    "reasoning_tokens",
    "cached_prompt_tokens",
    "providers",
    "reported_usd",
    "estimated_usd",
]


@dataclass
class _Facts:
    sess: m.Session
    model: str
    architecture: str
    final_level: str | None = None
    repair_calls: int = 0
    both_reported: float = 0.0  # sums over calls that have a reported AND an estimated cost
    both_estimated: float = 0.0
    both_calls: int = 0
    providers: set[str] = field(default_factory=set)  # serving providers of the calls (D-041)

    @property
    def provider_key(self) -> str:
        """`model / provider`; several providers in one session are joined with `+`, and a
        session whose calls reported none is `unknown` (B-051)."""
        return f"{self.model} / {'+'.join(sorted(self.providers)) or 'unknown'}"


@dataclass
class Report:
    header: list[str]
    rows: list[list[str]] = field(default_factory=list)


def _load(db: Session, status: StatusFilter) -> list[_Facts]:
    q = select(m.Session).order_by(m.Session.created_at, m.Session.id)
    if status == "completed":
        q = q.where(m.Session.status == "completed")
    facts: dict[str, _Facts] = {}
    for s in db.scalars(q):
        snap = loads(s.agent_snapshot_json)
        facts[s.id] = _Facts(sess=s, model=str(snap["model"]), architecture=snap["architecture"])
    for a in db.scalars(select(m.Assessment)):
        if a.session_id in facts:
            facts[a.session_id].final_level = loads(a.result_json)["triage_level"]
    for call in db.scalars(select(m.LLMCall)):
        f = facts.get(call.session_id)
        if f is None:
            continue
        if call.provider:
            f.providers.add(call.provider)
        if call.purpose == "repair":
            f.repair_calls += 1
        if call.cost_usd is not None and call.estimated_cost_usd is not None:
            f.both_reported += call.cost_usd
            f.both_estimated += call.estimated_cost_usd
            f.both_calls += 1
    return list(facts.values())


def _int(v: int | None) -> str:
    return "" if v is None else str(v)


def _num(v: float | None, digits: int) -> str:
    return "" if v is None else f"{v:.{digits}f}"


def _usd(v: float | None) -> str:
    return _num(v, 6)


def _present[T](values: list[T | None]) -> list[T]:
    return [v for v in values if v is not None]


def diff_ratio(estimated: float, reported: float) -> float | None:
    return (estimated - reported) / reported if reported else None


def _group_row(key: str, group: list[_Facts]) -> list[str]:
    def tokens(attr: str) -> tuple[str, str]:
        values = _present([getattr(f.sess, attr) for f in group])
        return (_int(sum(values)) if values else "", _num(fmean(values), 1) if values else "")

    reported = _present([f.sess.total_cost_usd for f in group])
    estimated = _present([f.sess.total_estimated_cost_usd for f in group])
    both = [f for f in group if f.both_calls]
    ratio = (
        diff_ratio(sum(f.both_estimated for f in both), sum(f.both_reported for f in both))
        if both
        else None
    )
    return [
        key,
        str(len(group)),
        str(sum(f.sess.llm_call_count for f in group)),
        str(sum(f.repair_calls for f in group)),
        *tokens("total_prompt_tokens"),
        *tokens("total_completion_tokens"),
        *tokens("total_reasoning_tokens"),
        *tokens("total_cached_prompt_tokens"),
        _usd(sum(reported)) if reported else "",
        _usd(fmean(reported)) if reported else "",
        _usd(median(reported)) if reported else "",
        _usd(max(reported)) if reported else "",
        _usd(sum(estimated)) if estimated else "",
        _usd(fmean(estimated)) if estimated else "",
        _num(ratio * 100, 1) if ratio is not None else "",
        FLAG if ratio is not None and abs(ratio) > DIFF_THRESHOLD else "",
    ]


def _session_row(f: _Facts) -> list[str]:
    s = f.sess
    return [
        s.id,
        s.agent_id,
        f.model,
        f.architecture,
        s.status,
        s.end_reason or "",
        str(s.questions_asked),
        f.final_level or "",
        str(s.llm_call_count),
        _int(s.total_prompt_tokens),
        _int(s.total_completion_tokens),
        _int(s.total_reasoning_tokens),
        _int(s.total_cached_prompt_tokens),
        "+".join(sorted(f.providers)),
        _usd(s.total_cost_usd),
        _usd(s.total_estimated_cost_usd),
    ]


def build_report(
    db: Session, by: GroupBy = "agent", status: StatusFilter = "completed"
) -> Report | None:
    """None when no session matches the status filter."""
    facts = _load(db, status)
    if not facts:
        return None
    if by == "session":
        return Report(SESSION_HEADER, [_session_row(f) for f in facts])
    groups: dict[str, list[_Facts]] = defaultdict(list)
    for f in facts:  # grouping by the session snapshot, like the metrics (B-021)
        key = {
            "agent": f.sess.agent_id,
            "model": f.model,
            "architecture": f.architecture,
            "provider": f.provider_key,
        }[by]
        groups[key].append(f)
    return Report(GROUP_HEADER, [_group_row(k, groups[k]) for k in sorted(groups)])


def format_table(report: Report) -> str:
    rows = [report.header, *report.rows]
    widths = [max(len(r[i]) for r in rows) for i in range(len(report.header))]
    return "\n".join(
        "  ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)).rstrip() for row in rows
    )


def to_csv(report: Report) -> bytes:
    """The same cells as the table, UTF-8 with BOM like the admin exports."""
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(report.header)
    writer.writerows(report.rows)
    return buf.getvalue().encode("utf-8-sig")
