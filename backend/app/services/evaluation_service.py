"""Per-message feedback and post-session evaluation (API_CONTRACT §6)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.types import dumps, utcnow
from app.errors import AppError, forbidden, not_found, validation_error
from app.schemas.api import EvaluationInput, EvaluationOut, FeedbackOut, FeedbackRequest
from app.services.session_service import TURN_KINDS, evaluation_out, load_session


def _is_evaluated(db: Session, session_id: str) -> bool:
    return (
        db.scalar(select(m.Evaluation.id).where(m.Evaluation.session_id == session_id)) is not None
    )


def _feedback_target(db: Session, message_id: str, user: m.User) -> m.Message:
    msg = db.get(m.Message, message_id)
    if msg is None:
        raise not_found("Message not found")
    sess = load_session(db, msg.session_id)
    if sess.user_id != user.id:
        raise forbidden("Feedback is only allowed on your own sessions")
    if msg.role != "agent" or msg.kind not in TURN_KINDS:
        raise validation_error("Feedback is only allowed on agent questions and results")
    if _is_evaluated(db, sess.id):
        raise AppError(409, "EVALUATION_LOCKED", "Feedback is read-only after the evaluation")
    return msg


def _existing(db: Session, message_id: str, user_id: str) -> m.MessageFeedback | None:
    return db.scalar(
        select(m.MessageFeedback).where(
            m.MessageFeedback.message_id == message_id, m.MessageFeedback.user_id == user_id
        )
    )


def put_feedback(db: Session, message_id: str, user: m.User, body: FeedbackRequest) -> FeedbackOut:
    msg = _feedback_target(db, message_id, user)
    fb = _existing(db, msg.id, user.id)
    if fb is None:
        fb = m.MessageFeedback(message_id=msg.id, user_id=user.id)
        db.add(fb)
    fb.rating = body.rating
    fb.note = body.note
    fb.updated_at = utcnow()
    db.commit()
    return FeedbackOut.model_validate(fb)


def delete_feedback(db: Session, message_id: str, user: m.User) -> None:
    msg = _feedback_target(db, message_id, user)
    fb = _existing(db, msg.id, user.id)
    if fb is not None:
        db.delete(fb)
        db.commit()


def submit_evaluation(
    db: Session, session_id: str, user: m.User, body: EvaluationInput
) -> EvaluationOut:
    sess = load_session(db, session_id)
    if sess.user_id != user.id:
        raise forbidden("Only the session owner can evaluate it")
    if sess.status != "completed":
        raise AppError(409, "SESSION_NOT_COMPLETED", "The session is not completed yet")
    if _is_evaluated(db, sess.id):
        raise AppError(409, "EVALUATION_LOCKED", "Session already evaluated")
    if body.comparison is not None:
        other = db.get(m.Session, body.comparison.compared_session_id)
        if (
            other is None
            or other.id == sess.id
            or other.user_id != user.id
            or other.status != "completed"
        ):
            raise validation_error(
                "comparison.compared_session_id must be another completed session of yours"
            )
    now = utcnow()
    ev = m.Evaluation(
        session_id=sess.id,
        user_id=user.id,
        data_json=dumps(body.model_dump(mode="json")),
        created_at=now,
        updated_at=now,
    )
    db.add(ev)
    db.commit()
    return evaluation_out(ev)
