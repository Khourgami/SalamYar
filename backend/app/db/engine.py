"""SQLite engine (WAL, foreign keys), session factory, `init_db()` and the `get_db` dependency."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def make_engine(database_path: str) -> Engine:
    """Create an engine for a file path, or a shared in-memory DB for ':memory:'."""
    if database_path == ":memory:":
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    else:
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            f"sqlite:///{database_path}", connect_args={"check_same_thread": False, "timeout": 30}
        )

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn: Any, _record: Any) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


def configure(database_path: str) -> Engine:
    """(Re)bind the module-level engine and session factory."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = make_engine(database_path)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        from app.settings import get_settings

        configure(get_settings().database_path)
    assert _engine is not None
    return _engine


def session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


class SchemaError(RuntimeError):
    """The DB file was created by an older version (no migrations in the PoC)."""


SCHEMA_ERROR = (
    "database schema is older than the current schema — delete data/*.db or use a new DATABASE_PATH"
)


def check_schema(engine: Engine) -> None:
    """Fail fast when an existing table lacks a column of the current models: `create_all`
    creates missing tables but never adds columns to existing ones."""
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    missing: list[str] = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            continue
        have = {c["name"] for c in insp.get_columns(table.name)}
        missing += [f"{table.name}.{col.name}" for col in table.columns if col.name not in have]
    if missing:
        raise SchemaError(f"{SCHEMA_ERROR} (missing columns: {', '.join(missing)})")


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(engine)
    check_schema(engine)


def get_db() -> Iterator[Session]:
    db = session_factory()()
    try:
        yield db
    finally:
        db.close()
