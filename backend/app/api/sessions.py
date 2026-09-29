"""Session endpoints (API_CONTRACT §5)."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.agents.registry import Registry, get_registry
from app.api.deps import get_llm
from app.auth.deps import current_user
from app.db import get_db
from app.db.models import User
from app.llm.client import LLMClient
from app.schemas.api import (
    CreateSessionRequest,
    PostMessageRequest,
    SessionDetail,
    SessionList,
    TurnResponse,
)
from app.services import session_service as svc

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionDetail, status_code=201)
def create_session(
    body: CreateSessionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    registry: Registry = Depends(get_registry),
) -> SessionDetail:
    sess = svc.create_session(db, registry, user, body.agent_id)
    return svc.build_detail(db, sess, user)


@router.get("", response_model=SessionList)
def list_sessions(
    status: Literal["active", "completed"] | None = None,
    evaluated: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SessionList:
    rows, total = svc.list_sessions(
        db, user_id=user.id, status=status, evaluated=evaluated, limit=limit, offset=offset
    )
    return SessionList(items=[svc.build_summary(db, s) for s in rows], total=total)


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> SessionDetail:
    return svc.build_detail(db, svc.load_owned(db, session_id, user), user)


@router.post("/{session_id}/messages", response_model=TurnResponse)
async def post_message(
    session_id: str,
    body: PostMessageRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> TurnResponse:
    return await svc.process_turn(db, llm, session_id, user, text=body.text)


@router.post("/{session_id}/finish", response_model=TurnResponse)
async def finish(
    session_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> TurnResponse:
    return await svc.process_turn(db, llm, session_id, user, text=None, forced="evaluator_ended")
