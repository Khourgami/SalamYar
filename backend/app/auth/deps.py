"""FastAPI auth dependencies: `current_user` and `require_admin`."""

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.db import get_db
from app.db.models import User
from app.errors import forbidden, unauthorized

_bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise unauthorized("Missing bearer token")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError as exc:
        raise unauthorized("Invalid or expired token") from exc
    user = db.get(User, str(payload["sub"]))
    if user is None:
        raise unauthorized("Unknown user")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise forbidden("Admin role required")
    return user
