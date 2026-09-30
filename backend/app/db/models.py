"""SQLAlchemy models — exactly the tables and columns of BACKEND_ARCHITECTURE §7.

JSON columns are TEXT holding JSON (see `app.db.types.dumps/loads`).
"""

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.types import UTCDateTime, new_id, utcnow


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    architecture: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(200))
    config_json: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    agent_snapshot_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")
    end_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)
    questions_asked: Mapped[int] = mapped_column(Integer, default=0)
    clinical_state_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    total_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_llm_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turn_in_progress: Mapped[bool] = mapped_column(Boolean, default=False)
    # v1.2 (§8a, D-035): totals over every LLM attempt, refreshed after each attempt. Token and
    # estimate totals stay null until at least one attempt reported the value.
    llm_call_count: Mapped[int] = mapped_column(Integer, default=0)
    total_prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_reasoning_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_estimated_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    # phase 2d (D-042): sum of cached prompt tokens over the attempts that reported them
    total_cached_prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("session_id", "seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TurnBackstage(Base):
    __tablename__ = "turn_backstage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"))
    data_json: Mapped[str] = mapped_column(Text)


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), unique=True)
    result_json: Mapped[str] = mapped_column(Text)
    raw_result_json: Mapped[str] = mapped_column(Text)
    guard_report_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(200))
    request_json: Mapped[str] = mapped_column(Text)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_ok: Mapped[bool] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reasoning_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempt: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # v1.2 (§8a, D-035): the price snapshot used and the estimate (null without usage)
    price_input_per_mtok: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_output_per_mtok: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    # phase 2d: serving provider reported by OpenRouter (D-041) and cached prompt tokens (D-042);
    # null for attempts without a response (deadline, transport failure)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cached_prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[str] = mapped_column(String(10))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    data_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
