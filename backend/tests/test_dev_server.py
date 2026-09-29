"""Dev server (D-029): DB path, seeding, DemoLLM delay and the «خطا» failure trigger."""

import io
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import dev_server
from app.api.deps import get_llm
from app.cli import main as cli_main
from app.db import models as m
from app.llm.client import LLMMessage, LLMRequest
from app.llm.demo import INVALID_OUTPUT, DemoLLM
from app.main import app
from app.services.user_service import authenticate
from tests.lab import Lab


def _args(tmp_path: Path, *extra: str) -> object:
    return dev_server.build_parser().parse_args(["--db", str(tmp_path / "dev.db"), *extra])


# --- options -------------------------------------------------------------------------------


def test_defaults() -> None:
    args = dev_server.build_parser().parse_args([])
    assert args.db == "data/dev.db"
    assert args.delay_ms == 1500
    assert args.seed is False


def test_refuses_production_db() -> None:
    with pytest.raises(SystemExit, match="refuses"):
        dev_server.check_db_path("data/lab.db")
    with pytest.raises(SystemExit):
        dev_server.check_db_path(str(Path("data/lab.db").resolve()))
    dev_server.check_db_path("data/dev.db")


def test_build_app_applies_db_and_delay(tmp_path: Path) -> None:
    from app import db as app_db

    asgi, seeded = dev_server.build_app(_args(tmp_path, "--delay-ms", "250"))
    assert isinstance(asgi, dev_server.SessionIdMiddleware)
    assert seeded == []
    assert Path(app_db.get_engine().url.database or "") == tmp_path / "dev.db"
    demo = app.dependency_overrides[get_llm]()
    assert isinstance(demo, DemoLLM) and demo.delay_ms == 250


def test_main_prints_url_db_and_usernames_not_passwords(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import uvicorn

    calls: list[tuple[object, dict[str, object]]] = []
    monkeypatch.setattr(uvicorn, "run", lambda asgi, **kw: calls.append((asgi, kw)))
    dev_server.main(["--db", str(tmp_path / "dev.db"), "--seed", "--port", "8123"])
    out = capsys.readouterr().out
    assert "http://127.0.0.1:8123/api/v1" in out
    assert str((tmp_path / "dev.db").resolve()) in out
    assert "doctor, doctor2, admin" in out
    assert "doctor123" not in out and "admin123" not in out
    assert calls and calls[0][1] == {"host": "127.0.0.1", "port": 8123}


# --- seeding -------------------------------------------------------------------------------


def test_seed_is_idempotent(db: Session) -> None:
    assert dev_server.seed_users(db) == ["doctor", "doctor2", "admin"]
    hashes = {u.username: u.password_hash for u in db.scalars(select(m.User))}
    assert dev_server.seed_users(db) == []
    users = list(db.scalars(select(m.User)))
    assert len(users) == 3
    assert {u.username: u.password_hash for u in users} == hashes
    roles = {u.username: (u.role, u.display_name) for u in users}
    assert roles == {
        "doctor": ("evaluator", "دکتر آزمایشی"),
        "doctor2": ("evaluator", "دکتر آزمایشی ۲"),
        "admin": ("admin", "مدیر"),
    }
    assert authenticate(db, "doctor", "doctor123") is not None
    assert authenticate(db, "admin", "admin123") is not None


def test_seed_never_overwrites_existing_password(db: Session) -> None:
    from app.services.user_service import create_user

    create_user(db, username="doctor", display_name="X", password="my-own-pass", role="admin")
    assert dev_server.seed_users(db) == ["doctor2", "admin"]
    assert authenticate(db, "doctor", "my-own-pass") is not None
    assert authenticate(db, "doctor", "doctor123") is None


# --- DemoLLM delay -------------------------------------------------------------------------


def _req(text: str = "سلام") -> LLMRequest:
    return LLMRequest(
        model="demo/x",
        messages=[
            LLMMessage(role="system", content="simple"),
            LLMMessage(role="user", content=text),
        ],
    )


async def test_delay_is_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    sleep = AsyncMock()
    monkeypatch.setattr("app.llm.demo.asyncio.sleep", sleep)
    await DemoLLM(delay_ms=1500).complete(_req())
    sleep.assert_awaited_once_with(1.5)
    sleep.reset_mock()
    await DemoLLM().complete(_req())
    sleep.assert_not_awaited()


# --- failure trigger -----------------------------------------------------------------------


@pytest.fixture
def dev(lab: Lab) -> tuple[Lab, TestClient]:
    demo = DemoLLM()
    app.dependency_overrides[get_llm] = lambda: demo
    client = TestClient(dev_server.SessionIdMiddleware(app), raise_server_exceptions=False)
    return lab, client


def _post(lab: Lab, client: TestClient, sid: str, text: str) -> object:
    return client.post(f"/api/v1/sessions/{sid}/messages", json={"text": text}, headers=lab.h())


@pytest.mark.parametrize("agent", ["a-simple", "b-struct"])
def test_failure_trigger_fails_once_then_resend_succeeds(
    dev: tuple[Lab, TestClient], db: Session, agent: str
) -> None:
    lab, client = dev
    sid = lab.create(agent)["id"]
    text = "یک خطا در سیستم؟ سردرد دارم"

    r = _post(lab, client, sid, text)
    assert r.status_code == 502, r.text  # type: ignore[attr-defined]
    body = r.json()  # type: ignore[attr-defined]
    assert body["error"]["code"] == "AGENT_ERROR"
    assert body["patient_message"]["text"] == text
    assert body["agent_message"]["kind"] == "error"
    calls = list(db.scalars(select(m.LLMCall).where(m.LLMCall.session_id == sid)))
    assert [(c.purpose, c.parsed_ok) for c in calls] == [("turn", False), ("repair", False)]
    assert all(c.response_text == INVALID_OUTPUT for c in calls)
    detail = client.get(f"/api/v1/sessions/{sid}", headers=lab.h()).json()
    assert detail["status"] == "active"

    r = _post(lab, client, sid, text)  # the client's resend
    assert r.status_code == 200, r.text  # type: ignore[attr-defined]
    assert r.json()["patient_message"]["id"] == body["patient_message"]["id"]  # type: ignore[attr-defined]
    messages = r.json()["session"]["messages"]  # type: ignore[attr-defined]
    assert [x["text"] for x in messages if x["role"] == "patient"] == [text]


def test_failure_trigger_is_per_session(dev: tuple[Lab, TestClient]) -> None:
    lab, client = dev
    for _ in range(2):  # identical transcripts in two sessions both fail once
        sid = lab.create("a-simple")["id"]
        assert _post(lab, client, sid, "خطا").status_code == 502  # type: ignore[attr-defined]
        assert _post(lab, client, sid, "خطا").status_code == 200  # type: ignore[attr-defined]


def test_messages_without_trigger_are_answered(dev: tuple[Lab, TestClient]) -> None:
    lab, client = dev
    sid = lab.create("b-struct")["id"]
    assert _post(lab, client, sid, "سردرد دارم").status_code == 200  # type: ignore[attr-defined]


# --- create-user --password-stdin ------------------------------------------------------------


def _create(monkeypatch: pytest.MonkeyPatch, stdin: str, username: str) -> int:
    monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    monkeypatch.setattr("getpass.getpass", lambda _p="": pytest.fail("must not prompt"))
    return cli_main(
        ["create-user", "--username", username, "--display-name", "QA", "--role", "evaluator"]
        + ["--password-stdin"]
    )


def test_password_stdin(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], db: Session
) -> None:
    assert _create(monkeypatch, "﻿secret123\r\nignored\n", "qa") == 0
    assert "created evaluator 'qa'" in capsys.readouterr().out
    assert authenticate(db, "qa", "secret123") is not None

    assert _create(monkeypatch, "1234567\n", "qa2") == 1  # 7 characters
    assert "at least 8" in capsys.readouterr().err
    assert _create(monkeypatch, "another-pass\n", "qa") == 1  # duplicate username
    assert "already exists" in capsys.readouterr().err
