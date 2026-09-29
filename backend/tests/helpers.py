"""Shared test helpers."""

from app import db as app_db
from app.auth.security import create_access_token
from app.db.models import User
from app.services.user_service import create_user

PASSWORD = "correct-horse-1"


def make_user(username: str = "dr.a", role: str = "evaluator") -> User:
    with app_db.session_factory()() as s:
        return create_user(
            s,
            username=username,
            display_name=f"Dr {username}",
            password=PASSWORD,
            role=role,  # type: ignore[arg-type]
        )


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}
