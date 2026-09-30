"""Sessions and turns (API_CONTRACT §4–§5): creation, views, locking, turn processing."""

import hashlib
import logging
import time
from statistics import fmean
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.agents.architectures import build_architecture
from app.agents.base import EndReason, SessionContext, TurnOutcome, build_transcript
from app.agents.clinical_schemas import AssessmentResult, ClinicalState, GuardReport, Hypothesis
from app.agents.config import AgentConfig, ModelPricing
from app.agents.json_runner import AgentOutputError, TraceRecord
from app.agents.registry import Registry
from app.agents.texts_fa import ERROR_FA, GREETING_FA
from app.db import models as m
from app.db.types import dumps, loads, utcnow
from app.errors import AppError, forbidden, not_found
from app.llm.budget import TurnBudget
from app.llm.client import LLMClient, LLMError
from app.schemas.api import (
    AgentPublic,
    AgentReveal,
    AgentRevealConfig,
    EvaluationOut,
    FeedbackOut,
    MessageOut,
    ResultCard,
    ResultStats,
    SessionDetail,
    SessionSummary,
    TurnResponse,
)
from app.settings import get_settings

logger = logging.getLogger(__name__)

TURN_KINDS = ("question", "result")


# --- agents --------------------------------------------------------------------------------


def shuffle_key(user_id: str, agent_id: str) -> str:
    return hashlib.sha256(f"{user_id}{agent_id}".encode()).hexdigest()


def list_agents(registry: Registry, user: m.User) -> list[AgentPublic]:
    agents = sorted(registry.enabled(), key=lambda a: shuffle_key(user.id, a.id))
    return [
        AgentPublic(id=a.id, display_name=a.display_name, description=a.description) for a in agents
    ]


# --- loading & access ----------------------------------------------------------------------


def load_session(db: Session, session_id: str) -> m.Session:
    sess = db.get(m.Session, session_id)
    if sess is None:
        raise not_found("Session not found")
    return sess


def load_owned(db: Session, session_id: str, user: m.User) -> m.Session:
    """Owner only, for every role including admin (D-020); unknown id → 404 first."""
    sess = load_session(db, session_id)
    if sess.user_id != user.id:
        raise forbidden("Not the owner of this session")
    return sess


def snapshot(sess: m.Session) -> AgentConfig:
    return AgentConfig.model_validate(loads(sess.agent_snapshot_json))


# --- views ---------------------------------------------------------------------------------


def message_out(msg: m.Message) -> MessageOut:
    return MessageOut.model_validate(msg)


def _messages(db: Session, session_id: str) -> list[m.Message]:
    return list(
        db.scalars(
            select(m.Message).where(m.Message.session_id == session_id).order_by(m.Message.seq)
        )
    )


def _assessment(db: Session, session_id: str) -> m.Assessment | None:
    return db.scalar(select(m.Assessment).where(m.Assessment.session_id == session_id))


def _evaluation(db: Session, session_id: str) -> m.Evaluation | None:
    return db.scalar(select(m.Evaluation).where(m.Evaluation.session_id == session_id))


def agent_public(sess: m.Session) -> AgentPublic:
    cfg = loads(sess.agent_snapshot_json)
    return AgentPublic(
        id=sess.agent_id, display_name=cfg["display_name"], description=cfg.get("description")
    )


def agent_reveal(sess: m.Session) -> AgentReveal:
    cfg = snapshot(sess)
    return AgentReveal(
        architecture=cfg.architecture,
        model=cfg.model,
        config=AgentRevealConfig(
            max_questions=cfg.options.max_questions,
            safety_floor=cfg.options.safety_floor,
            emergency_threshold=cfg.options.emergency_threshold,
            reasoning_effort=cfg.reasoning_effort,
            temperature=cfg.effective_temperature,
            prompt_version=cfg.prompt_version,
        ),
    )


def evaluation_out(ev: m.Evaluation) -> EvaluationOut:
    return EvaluationOut.model_validate(
        {
            **loads(ev.data_json),
            "id": ev.id,
            "session_id": ev.session_id,
            "created_at": ev.created_at,
        }
    )


def build_summary(db: Session, sess: m.Session) -> SessionSummary:
    first_patient = db.scalar(
        select(m.Message.text)
        .where(m.Message.session_id == sess.id, m.Message.role == "patient")
        .order_by(m.Message.seq)
        .limit(1)
    )
    assessment = _assessment(db, sess.id)
    final_level = loads(assessment.result_json)["triage_level"] if assessment else None
    return SessionSummary(
        id=sess.id,
        agent=agent_public(sess),
        status=sess.status,  # type: ignore[arg-type]
        end_reason=sess.end_reason,  # type: ignore[arg-type]
        questions_asked=sess.questions_asked,
        created_at=sess.created_at,
        completed_at=sess.completed_at,
        evaluated=_evaluation(db, sess.id) is not None,
        first_patient_message=first_patient,
        final_triage_level=final_level,
    )


def _llm_totals(db: Session, session_id: str) -> tuple[float | None, int | None]:
    cost, n_cost, latency = db.execute(
        select(
            func.sum(m.LLMCall.cost_usd),
            func.count(m.LLMCall.cost_usd),
            func.sum(m.LLMCall.latency_ms),
        ).where(m.LLMCall.session_id == session_id)
    ).one()
    return (float(cost) if n_cost else None), (int(latency) if latency is not None else None)


def _usage_totals(db: Session, session_id: str) -> dict[str, Any]:
    """v1.2 session totals over every attempt; SUM is NULL when no attempt reported a value."""
    count, prompt, completion, reasoning, estimated = db.execute(
        select(
            func.count(m.LLMCall.id),
            func.sum(m.LLMCall.prompt_tokens),
            func.sum(m.LLMCall.completion_tokens),
            func.sum(m.LLMCall.reasoning_tokens),
            func.sum(m.LLMCall.estimated_cost_usd),
        ).where(m.LLMCall.session_id == session_id)
    ).one()
    return {
        "llm_call_count": int(count),
        "total_prompt_tokens": prompt,
        "total_completion_tokens": completion,
        "total_reasoning_tokens": reasoning,
        "total_estimated_cost_usd": float(estimated) if estimated is not None else None,
    }


def usage_visible(viewer: m.User, evaluated: bool, *, admin_view: bool = False) -> bool:
    """D-035 blindness: cost, tokens and call count hint at the model and architecture, so a
    non-admin caller sees them only after the evaluation. Admins always see them."""
    return admin_view or viewer.role == "admin" or evaluated


def _result_card(
    db: Session,
    sess: m.Session,
    messages: list[m.Message],
    assessment: m.Assessment,
    *,
    show_usage: bool,
) -> ResultCard:
    latencies = [
        msg.latency_ms
        for msg in messages
        if msg.role == "agent" and msg.kind in TURN_KINDS and msg.latency_ms is not None
    ]
    duration = (sess.completed_at - sess.created_at).total_seconds() if sess.completed_at else 0.0
    return ResultCard(
        assessment=AssessmentResult.model_validate(loads(assessment.result_json)),
        guard=GuardReport.model_validate(loads(assessment.guard_report_json)),
        stats=ResultStats(
            questions_asked=sess.questions_asked,
            duration_seconds=round(duration, 3),
            mean_turn_latency_ms=round(fmean(latencies), 1) if latencies else None,
            total_cost_usd=_llm_totals(db, sess.id)[0] if show_usage else None,
            llm_calls=sess.llm_call_count if show_usage else None,
            prompt_tokens=sess.total_prompt_tokens if show_usage else None,
            completion_tokens=sess.total_completion_tokens if show_usage else None,
            reasoning_tokens=sess.total_reasoning_tokens if show_usage else None,
        ),
    )


def _backstage(db: Session, session_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(m.TurnBackstage, m.Message.id)
        .join(m.Message, m.Message.id == m.TurnBackstage.message_id)
        .where(m.TurnBackstage.session_id == session_id)
        .order_by(m.Message.seq)
    ).all()
    return [{"message_id": message_id, **loads(bs.data_json)} for bs, message_id in rows]


def _feedback(db: Session, session_id: str, user_id: str | None) -> list[FeedbackOut]:
    q = (
        select(m.MessageFeedback)
        .join(m.Message, m.Message.id == m.MessageFeedback.message_id)
        .where(m.Message.session_id == session_id)
        .order_by(m.Message.seq, m.MessageFeedback.updated_at)
    )
    if user_id is not None:
        q = q.where(m.MessageFeedback.user_id == user_id)
    return [FeedbackOut.model_validate(f) for f in db.scalars(q)]


def build_detail(
    db: Session, sess: m.Session, viewer: m.User, *, admin_view: bool = False
) -> SessionDetail:
    summary = build_summary(db, sess)
    messages = _messages(db, sess.id)
    completed = sess.status == "completed"
    assessment = _assessment(db, sess.id) if completed else None
    evaluation = _evaluation(db, sess.id)
    show_reveal = admin_view or evaluation is not None or viewer.role == "admin"
    show_usage = usage_visible(viewer, evaluation is not None, admin_view=admin_view)
    return SessionDetail(
        **summary.model_dump(),
        messages=[message_out(msg) for msg in messages],
        result=(
            _result_card(db, sess, messages, assessment, show_usage=show_usage)
            if assessment
            else None
        ),
        backstage=_backstage(db, sess.id) if completed else None,
        feedback=_feedback(db, sess.id, None if admin_view else viewer.id),
        evaluation=evaluation_out(evaluation) if evaluation else None,
        reveal=agent_reveal(sess) if show_reveal else None,
    )


def list_sessions(
    db: Session,
    *,
    user_id: str | None,
    agent_id: str | None = None,
    status: str | None = None,
    evaluated: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[m.Session], int]:
    q = select(m.Session)
    if user_id is not None:
        q = q.where(m.Session.user_id == user_id)
    if agent_id is not None:
        q = q.where(m.Session.agent_id == agent_id)
    if status is not None:
        q = q.where(m.Session.status == status)
    if evaluated is not None:
        has_eval = select(m.Evaluation.id).where(m.Evaluation.session_id == m.Session.id).exists()
        q = q.where(has_eval if evaluated else ~has_eval)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(m.Session.created_at.desc(), m.Session.id.desc()).limit(limit).offset(offset)
    )
    return list(rows), total


# --- creation ------------------------------------------------------------------------------


def create_session(db: Session, registry: Registry, user: m.User, agent_id: str) -> m.Session:
    cfg = registry.get(agent_id)
    if cfg is None or not cfg.enabled:
        raise not_found("Agent not found")
    if db.get(m.Agent, cfg.id) is None:
        registry.sync_to_db(db)
    sess = m.Session(
        user_id=user.id,
        agent_id=cfg.id,
        agent_snapshot_json=dumps(cfg.model_dump(mode="json")),
        status="active",
        questions_asked=0,
        clinical_state_json="{}" if cfg.architecture == "structured" else None,
        turn_in_progress=False,
    )
    db.add(sess)
    db.flush()
    db.add(
        m.Message(
            session_id=sess.id,
            seq=1,
            role="agent",
            kind="greeting",
            text=GREETING_FA,
            latency_ms=None,
        )
    )
    db.commit()
    return sess


# --- turns ---------------------------------------------------------------------------------


def _acquire_lock(db: Session, session_id: str) -> None:
    result = db.execute(
        update(m.Session)
        .where(m.Session.id == session_id, m.Session.turn_in_progress.is_(False))
        .values(turn_in_progress=True)
    )
    db.commit()
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise AppError(
            409, "TURN_IN_PROGRESS", "A turn is already being processed for this session"
        )


def _release_lock(db: Session, session_id: str) -> None:
    db.rollback()
    db.execute(update(m.Session).where(m.Session.id == session_id).values(turn_in_progress=False))
    db.commit()


def _add_message(
    db: Session, sess: m.Session, *, role: str, kind: str, text: str, latency_ms: int | None = None
) -> m.Message:
    seq = (
        db.scalar(select(func.max(m.Message.seq)).where(m.Message.session_id == sess.id)) or 0
    ) + 1
    msg = m.Message(
        session_id=sess.id, seq=seq, role=role, kind=kind, text=text, latency_ms=latency_ms
    )
    db.add(msg)
    db.flush()
    return msg


def _patient_message(db: Session, sess: m.Session, text: str) -> m.Message:
    """Resend rule: reuse the last non-error message if it is a patient message with same text."""
    last = db.scalar(
        select(m.Message)
        .where(m.Message.session_id == sess.id, m.Message.kind != "error")
        .order_by(m.Message.seq.desc())
        .limit(1)
    )
    if last is not None and last.role == "patient" and last.text.strip() == text.strip():
        return last
    msg = _add_message(db, sess, role="patient", kind="text", text=text)
    db.commit()
    return msg


def _previous_hypotheses(db: Session, session_id: str) -> list[Hypothesis]:
    rows = db.execute(
        select(m.TurnBackstage.data_json)
        .join(m.Message, m.Message.id == m.TurnBackstage.message_id)
        .where(m.TurnBackstage.session_id == session_id)
        .order_by(m.Message.seq.desc())
        .limit(1)
    ).scalar()
    data = loads(rows) if rows else {}
    return [Hypothesis.model_validate(h) for h in data.get("hypotheses", [])]


def billable_output_tokens(completion_tokens: int | None) -> int | None:
    """B-043: every provider's `completion_tokens` already includes its reasoning tokens."""
    return completion_tokens


class _Tracer:
    """Persists one `llm_calls` row per attempt (with the snapshot price and the estimate) and
    refreshes the session totals; rows are linked to the agent message later."""

    def __init__(self, db: Session, sess: m.Session, pricing: ModelPricing | None) -> None:
        self.db = db
        self.sess = sess
        self.pricing = pricing
        self.call_ids: list[str] = []

    def __call__(self, rec: TraceRecord) -> None:
        resp = rec.response
        prompt = resp.prompt_tokens if resp else None
        completion = resp.completion_tokens if resp else None
        price = self.pricing
        row = m.LLMCall(
            session_id=self.sess.id,
            message_id=None,
            purpose=rec.purpose,
            model=rec.request.model,
            request_json=dumps(rec.request.model_dump(mode="json")),
            response_text=resp.text if resp else None,
            parsed_ok=rec.parsed_ok,
            error=rec.error,
            prompt_tokens=prompt,
            completion_tokens=completion,
            reasoning_tokens=resp.reasoning_tokens if resp else None,
            cost_usd=resp.cost_usd if resp else None,
            latency_ms=resp.latency_ms if resp else rec.latency_ms,
            attempt=rec.attempt,
            price_input_per_mtok=price.input_per_mtok if price else None,
            price_output_per_mtok=price.output_per_mtok if price else None,
            estimated_cost_usd=(
                price.estimate(prompt, billable_output_tokens(completion)) if price else None
            ),
        )
        self.db.add(row)
        self.db.flush()
        _update_totals(self.db, self.sess)
        self.db.commit()
        self.call_ids.append(row.id)

    def link(self, message_id: str) -> None:
        if self.call_ids:
            self.db.execute(
                update(m.LLMCall)
                .where(m.LLMCall.id.in_(self.call_ids))
                .values(message_id=message_id)
            )


def _build_context(
    db: Session, sess: m.Session, cfg: AgentConfig, tracer: _Tracer
) -> SessionContext:
    messages = _messages(db, sess.id)

    def save_state(state: ClinicalState) -> None:
        sess.clinical_state_json = dumps(state.model_dump(mode="json"))
        db.commit()

    structured = cfg.architecture == "structured"
    return SessionContext(
        config=cfg,
        transcript=build_transcript((msg.role, msg.kind, msg.text) for msg in messages),
        trace=tracer,
        questions_asked=sess.questions_asked,
        clinical_state=(
            ClinicalState.model_validate(loads(sess.clinical_state_json) or {})
            if structured
            else None
        ),
        previous_hypotheses=_previous_hypotheses(db, sess.id) if structured else [],
        save_clinical_state=save_state,
    )


async def _run_agent(
    llm: LLMClient, cfg: AgentConfig, ctx: SessionContext, forced: EndReason | None
) -> tuple[TurnOutcome, EndReason | None]:
    """Step 4: returns the outcome and the forced end reason (None if the agent concluded)."""
    arch = build_architecture(cfg, llm)
    max_q = cfg.options.max_questions
    if forced is None and ctx.questions_asked >= max_q:
        forced = "max_questions"
    if forced is not None:
        return await arch.force_conclude(ctx, forced), forced
    outcome = await arch.next_turn(ctx)
    if outcome.kind == "question" and ctx.questions_asked + 1 > max_q:
        return await arch.force_conclude(ctx, "max_questions"), "max_questions"
    return outcome, None


def new_turn_budget() -> TurnBudget:
    """D-038: a fresh budget for every `next_turn` / `force_conclude` (tests patch this)."""
    return get_settings().new_turn_budget()


def _update_totals(db: Session, sess: m.Session) -> None:
    sess.total_cost_usd, sess.total_llm_latency_ms = _llm_totals(db, sess.id)
    for key, value in _usage_totals(db, sess.id).items():
        setattr(sess, key, value)


async def process_turn(
    db: Session,
    llm: LLMClient,
    session_id: str,
    user: m.User,
    *,
    text: str | None,
    forced: EndReason | None = None,
) -> TurnResponse:
    """Handle `POST /messages` (text given) or `POST /finish` (text None, forced)."""
    sess = load_owned(db, session_id, user)
    if sess.status == "completed":
        raise AppError(409, "SESSION_COMPLETED", "Session is already completed")
    _acquire_lock(db, sess.id)
    try:
        db.refresh(sess)
        if sess.status == "completed":
            raise AppError(409, "SESSION_COMPLETED", "Session is already completed")
        patient = _patient_message(db, sess, text) if text is not None else None
        cfg = snapshot(sess)
        tracer = _Tracer(db, sess, cfg.pricing)
        ctx = _build_context(db, sess, cfg, tracer)

        ctx.budget = new_turn_budget()
        started = time.perf_counter()
        try:
            outcome, forced_reason = await _run_agent(llm, cfg, ctx, forced)
        except (AgentOutputError, LLMError) as exc:
            logger.warning("Agent error in session %s: %s", sess.id, exc)
            latency = int((time.perf_counter() - started) * 1000)
            error_msg = _add_message(
                db, sess, role="agent", kind="error", text=ERROR_FA, latency_ms=latency
            )
            tracer.link(error_msg.id)
            _update_totals(db, sess)
            db.commit()
            raise AppError(
                502,
                "AGENT_ERROR",
                "The agent failed to produce a valid reply; the message can be resent",
                extra={
                    "patient_message": message_out(patient).model_dump(mode="json")
                    if patient
                    else None,
                    "agent_message": message_out(error_msg).model_dump(mode="json"),
                },
            ) from exc
        latency = int((time.perf_counter() - started) * 1000)

        agent_msg = _add_message(
            db,
            sess,
            role="agent",
            kind=outcome.kind,
            text=outcome.agent_message,
            latency_ms=latency,
        )
        db.add(
            m.TurnBackstage(
                session_id=sess.id, message_id=agent_msg.id, data_json=dumps(outcome.backstage)
            )
        )
        if outcome.kind == "question":
            sess.questions_asked += 1
        else:
            assert outcome.assessment and outcome.raw_assessment and outcome.guard_report
            db.add(
                m.Assessment(
                    session_id=sess.id,
                    result_json=dumps(outcome.assessment.model_dump(mode="json")),
                    raw_result_json=dumps(outcome.raw_assessment.model_dump(mode="json")),
                    guard_report_json=dumps(outcome.guard_report.model_dump(mode="json")),
                )
            )
            sess.status = "completed"
            sess.completed_at = utcnow()
            sess.end_reason = forced_reason or "agent_concluded"
        tracer.link(agent_msg.id)
        db.flush()
        _update_totals(db, sess)
        db.commit()

        return TurnResponse(
            patient_message=message_out(patient) if patient else None,
            agent_message=message_out(agent_msg),
            session=build_detail(db, sess, user),
        )
    finally:
        _release_lock(db, sess.id)
