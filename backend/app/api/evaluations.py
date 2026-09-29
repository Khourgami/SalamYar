"""Feedback and evaluation endpoints (API_CONTRACT §6)."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.db.models import User
from app.schemas.api import EvaluationInput, EvaluationOut, FeedbackOut, FeedbackRequest
from app.services import evaluation_service as svc

router = APIRouter(tags=["feedback & evaluation"])


@router.put("/messages/{message_id}/feedback", response_model=FeedbackOut)
def put_feedback(
    message_id: str,
    body: FeedbackRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    return svc.put_feedback(db, message_id, user, body)


@router.delete("/messages/{message_id}/feedback", status_code=204)
def delete_feedback(
    message_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Response:
    svc.delete_feedback(db, message_id, user)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/evaluation", response_model=EvaluationOut, status_code=201)
def submit_evaluation(
    session_id: str,
    body: EvaluationInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    return svc.submit_evaluation(db, session_id, user, body)
