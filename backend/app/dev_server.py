"""Run the API with the offline DemoLLM instead of OpenRouter (local development only, D-029).

    uv run python -m app.dev_server [--port 8000] [--db data/dev.db] [--seed] [--delay-ms 1500]

Everything else (auth, registry, sessions) is real. No OpenRouter calls are made. The database
defaults to `data/dev.db` and is never `data/lab.db`. `--seed` creates the demo users that match
the web mocks. A patient message containing «خطا» fails once with 502 (see `app.llm.demo`).
"""

import argparse
import os
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

DEFAULT_DB = "data/dev.db"
PRODUCTION_DB = "data/lab.db"
DEFAULT_DELAY_MS = 1500

# (username, password, role, display name) — dev only, matches the web mocks (D-029).
SEED_USERS: tuple[tuple[str, str, str, str], ...] = (
    ("doctor", "doctor123", "evaluator", "دکتر آزمایشی"),
    ("doctor2", "doctor123", "evaluator", "دکتر آزمایشی ۲"),
    ("admin", "admin123", "admin", "مدیر"),
)

# Only used when neither the environment nor `.env` provides a value. The key is never sent
# anywhere because the DemoLLM replaces the OpenRouter client.
_DEV_ENV_DEFAULTS = {
    "OPENROUTER_API_KEY": "dev-server-unused-key",
    "JWT_SECRET": "dev-server-insecure-jwt-secret-do-not-use-in-production",
}

_SESSION_PATH = re.compile(r"/api/v1/sessions/([^/]+)/")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="app.dev_server", description="API with the offline demo LLM (no OpenRouter)"
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", default=DEFAULT_DB, help=f"SQLite path (default {DEFAULT_DB})")
    parser.add_argument("--seed", action="store_true", help="create the demo users if missing")
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=DEFAULT_DELAY_MS,
        help=f"simulated latency per LLM call in ms (default {DEFAULT_DELAY_MS})",
    )
    return parser


def check_db_path(path: str) -> None:
    """The dev server must never touch the production database."""
    if Path(path).resolve() == Path(PRODUCTION_DB).resolve():
        raise SystemExit(f"error: the dev server refuses to use {PRODUCTION_DB}; pick another --db")


def ensure_dev_env() -> None:
    """Fill required settings that neither the environment nor `.env` provides."""
    from app.settings import Settings, get_settings

    try:
        Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        for err in exc.errors():
            key = str(err["loc"][0]).upper() if err["loc"] else ""
            if err["type"] == "missing" and key in _DEV_ENV_DEFAULTS:
                os.environ[key] = _DEV_ENV_DEFAULTS[key]
    get_settings.cache_clear()


def seed_users(db: Session) -> list[str]:
    """Create the demo users that do not exist yet; never touches existing ones."""
    from app.db.models import User
    from app.services.user_service import create_user

    created = []
    for username, password, role, display_name in SEED_USERS:
        if db.scalar(select(User).where(User.username == username)) is None:
            create_user(
                db,
                username=username,
                display_name=display_name,
                password=password,
                role=role,  # type: ignore[arg-type]
            )
            created.append(username)
    return created


class SessionIdMiddleware:
    """Pure ASGI wrapper: exposes the session id of `/sessions/{id}/...` to the DemoLLM."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        from app.llm.demo import current_session_id

        match = _SESSION_PATH.match(scope.get("path", "")) if scope["type"] == "http" else None
        if match is None:
            await self.app(scope, receive, send)
            return
        token = current_session_id.set(match.group(1))
        try:
            await self.app(scope, receive, send)
        finally:
            current_session_id.reset(token)


def build_app(args: argparse.Namespace) -> tuple[Any, list[str]]:
    """Configure DB + DemoLLM and return the wrapped ASGI app and the seeded usernames."""
    check_db_path(args.db)
    ensure_dev_env()

    from app import db as app_db
    from app.api.deps import get_llm
    from app.llm.demo import DemoLLM
    from app.main import app

    app_db.configure(args.db)
    app_db.init_db()
    seeded: list[str] = []
    if args.seed:
        with app_db.session_factory()() as db:
            seed_users(db)
        seeded = [u[0] for u in SEED_USERS]
    demo = DemoLLM(delay_ms=max(0, args.delay_ms))
    app.dependency_overrides[get_llm] = lambda: demo
    return SessionIdMiddleware(app), seeded


def main(argv: Sequence[str] | None = None) -> None:
    import uvicorn

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
    from app.db.engine import SchemaError

    args = build_parser().parse_args(argv)
    try:
        asgi, seeded = build_app(args)
    except SchemaError as exc:
        raise SystemExit(f"error: {exc}") from None
    print(f"Dev server (DemoLLM, no OpenRouter): http://{args.host}:{args.port}/api/v1")
    print(f"Database: {Path(args.db).resolve()}")
    print(f"Simulated LLM delay: {max(0, args.delay_ms)} ms per call")
    if seeded:
        print(f"Seeded users: {', '.join(seeded)}")
    uvicorn.run(asgi, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
