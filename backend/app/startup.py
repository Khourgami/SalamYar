"""Startup hook: create tables, load the agent registry and sync it to the DB."""

from app.agents.registry import get_registry
from app.db import init_db, session_factory


def startup() -> None:
    init_db()
    registry = get_registry()
    with session_factory()() as db:
        registry.sync_to_db(db)
