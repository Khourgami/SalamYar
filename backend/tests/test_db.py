from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.types import dumps, loads


def _seed(db: Session) -> dict[str, str]:
    user = m.User(username="dr.a", display_name="دکتر الف", password_hash="x", role="evaluator")
    agent = m.Agent(
        id="b-test",
        display_name="دکتر ۱",
        description=None,
        architecture="structured",
        model="x/y",
        config_json=dumps({"a": 1}),
        enabled=True,
    )
    db.add_all([user, agent])
    db.flush()
    sess = m.Session(user_id=user.id, agent_id=agent.id, agent_snapshot_json=dumps({"id": "b"}))
    db.add(sess)
    db.flush()
    msg = m.Message(session_id=sess.id, seq=1, role="agent", kind="greeting", text="سلام")
    db.add(msg)
    db.flush()
    db.add_all(
        [
            m.TurnBackstage(session_id=sess.id, message_id=msg.id, data_json=dumps({"k": "v"})),
            m.Assessment(
                session_id=sess.id, result_json="{}", raw_result_json="{}", guard_report_json="{}"
            ),
            m.LLMCall(
                session_id=sess.id,
                message_id=msg.id,
                purpose="turn",
                model="x/y",
                request_json="{}",
                response_text="{}",
                parsed_ok=True,
                attempt=1,
            ),
            m.MessageFeedback(message_id=msg.id, user_id=user.id, rating="up", note=None),
            m.Evaluation(session_id=sess.id, user_id=user.id, data_json="{}"),
        ]
    )
    db.commit()
    return {"user": user.id, "session": sess.id, "message": msg.id}


def test_insert_and_read_every_table(db: Session) -> None:
    ids = _seed(db)
    db.expunge_all()
    for model in (
        m.User,
        m.Agent,
        m.Session,
        m.Message,
        m.TurnBackstage,
        m.Assessment,
        m.LLMCall,
        m.MessageFeedback,
        m.Evaluation,
    ):
        rows = db.query(model).all()
        assert len(rows) == 1, model.__tablename__
    sess = db.get(m.Session, ids["session"])
    assert sess is not None
    assert sess.status == "active"
    assert sess.questions_asked == 0
    assert sess.turn_in_progress is False
    assert sess.created_at.tzinfo is not None
    assert sess.created_at.utcoffset().total_seconds() == 0  # type: ignore[union-attr]
    assert loads(sess.agent_snapshot_json) == {"id": "b"}
    assert db.get(m.Message, ids["message"]).text == "سلام"  # type: ignore[union-attr]


def test_pragmas(db: Session) -> None:
    assert db.execute(text("PRAGMA foreign_keys")).scalar() == 1
    assert db.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def test_foreign_keys_enforced(db: Session) -> None:
    db.add(m.Message(session_id="missing", seq=1, role="agent", kind="greeting", text="x"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_username(db: Session) -> None:
    _seed(db)
    db.add(m.User(username="dr.a", display_name="x", password_hash="x", role="evaluator"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_assessment_per_session(db: Session) -> None:
    ids = _seed(db)
    db.add(
        m.Assessment(
            session_id=ids["session"],
            result_json="{}",
            raw_result_json="{}",
            guard_report_json="{}",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_evaluation_per_session(db: Session) -> None:
    ids = _seed(db)
    db.add(m.Evaluation(session_id=ids["session"], user_id=ids["user"], data_json="{}"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_feedback_per_message_and_user(db: Session) -> None:
    ids = _seed(db)
    db.add(m.MessageFeedback(message_id=ids["message"], user_id=ids["user"], rating="down"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_naive_datetime_rejected(db: Session) -> None:
    ids = _seed(db)
    sess = db.get(m.Session, ids["session"])
    assert sess is not None
    sess.completed_at = datetime(2026, 1, 1)
    with pytest.raises(Exception, match="naive"):
        db.commit()
    db.rollback()
    sess = db.get(m.Session, ids["session"])
    assert sess is not None
    sess.completed_at = datetime(2026, 1, 1, tzinfo=UTC)
    db.commit()
