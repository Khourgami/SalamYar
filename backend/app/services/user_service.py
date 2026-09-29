"""User creation and authentication."""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password, verify_password
from app.db.models import User

MIN_PASSWORD_LENGTH = 8


class UserError(ValueError):
    pass


def create_user(
    db: Session,
    *,
    username: str,
    display_name: str,
    password: str,
    role: Literal["evaluator", "admin"],
) -> User:
    username = username.strip()
    if not username:
        raise UserError("username must not be empty")
    if role not in ("evaluator", "admin"):
        raise UserError("role must be 'evaluator' or 'admin'")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise UserError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if db.scalar(select(User).where(User.username == username)) is not None:
        raise UserError(f"user '{username}' already exists")
    user = User(
        username=username,
        display_name=display_name.strip() or username,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    db.commit()
    return user


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username.strip()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user
