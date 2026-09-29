"""Password hashing (bcrypt via passlib) and JWT (HS256) encode/decode."""

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext

from app.settings import get_settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _pwd.verify(password, password_hash)
    except ValueError:
        return False


def create_access_token(user_id: str, role: str, *, expires_hours: float | None = None) -> str:
    settings = get_settings()
    hours = settings.jwt_expires_hours if expires_hours is None else expires_hours
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(UTC) + timedelta(hours=hours),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Return the payload; raises `jwt.PyJWTError` on invalid, tampered, or expired tokens."""
    return jwt.decode(
        token,
        get_settings().jwt_secret.get_secret_value(),
        algorithms=[ALGORITHM],
        options={"require": ["sub", "exp"]},
    )
