"""Auth endpoints (API_CONTRACT §3)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.security import create_access_token
from app.db import get_db
from app.db.models import User
from app.errors import unauthorized
from app.schemas.common import LoginRequest, LoginResponse, UserOut
from app.services.user_service import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = authenticate(db, body.username, body.password)
    if user is None:
        raise unauthorized("Invalid username or password")
    return LoginResponse(
        access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user)
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return UserOut.model_validate(user)
