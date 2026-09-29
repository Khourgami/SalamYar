import os

os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-test-SECRET-KEY-123")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-long-enough-1234")
os.environ.setdefault("OPENROUTER_BASE_URL", "https://openrouter.test/api/v1")

from collections.abc import Iterator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import db as app_db  # noqa: E402
from app.agents.registry import set_registry  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db(tmp_path: Path) -> Iterator[None]:
    """Every test gets its own SQLite file."""
    app_db.configure(str(tmp_path / "lab.db"))
    app_db.init_db()
    set_registry(None)
    yield
    set_registry(None)
    app.dependency_overrides.clear()
    app_db.get_engine().dispose()


@pytest.fixture
def db() -> Iterator[Session]:
    s = app_db.session_factory()()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def lab(client: TestClient, tmp_path: Path):  # type: ignore[no-untyped-def]
    from tests.lab import Lab

    return Lab(client, tmp_path)
