"""`init-qa` (phase 2d T4): a clean M3 database with one admin and one evaluator."""

import io
from pathlib import Path

import pytest
from sqlalchemy import select

from app import cli
from app import db as app_db
from app.auth.security import verify_password
from app.db import models as m
from tests.lab import TEST_AGENTS

ADMIN_PW = "admin-pass-123"
EVAL_PW = "eval-pass-456"


@pytest.fixture
def config(tmp_path: Path) -> str:
    path = tmp_path / "agents.yaml"
    path.write_text(TEST_AGENTS, encoding="utf-8")
    return str(path)


def _run(
    monkeypatch: pytest.MonkeyPatch,
    db: Path,
    config: str,
    stdin: str = f"﻿{ADMIN_PW}\r\n{EVAL_PW}\n",
    *extra: str,
) -> int:
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    argv = ["init-qa", "--admin", "boss", "--evaluator", "dr.a", "--db", str(db)]
    return cli.main([*argv, "--config", config, *extra])


def _users(db: Path) -> dict[str, m.User]:
    app_db.configure(str(db))
    with app_db.session_factory()() as s:
        return {u.username: u for u in s.scalars(select(m.User))}


def test_creates_schema_agents_and_users(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, config: str, capsys: pytest.CaptureFixture
) -> None:
    db = tmp_path / "qa" / "lab.db"
    assert _run(monkeypatch, db, config) == 0
    out = capsys.readouterr().out
    users = _users(db)
    assert {u: users[u].role for u in users} == {"boss": "admin", "dr.a": "evaluator"}
    assert verify_password(ADMIN_PW, users["boss"].password_hash)  # BOM and CRLF stripped
    assert verify_password(EVAL_PW, users["dr.a"].password_hash)
    with app_db.session_factory()() as s:
        agents = {a.id: a.enabled for a in s.scalars(select(m.Agent))}
    assert agents == {
        "a-simple": True,
        "b-struct": True,
        "a-capped": True,
        "b-capped": True,
        "a-off": False,
    }
    # the printed list is exactly the enabled agents, display name + id
    listed = [line.split() for line in out.split("enabled agents:")[1].strip().splitlines()]
    assert [row[-1] for row in listed] == ["a-simple", "b-struct", "a-capped", "b-capped"]
    assert listed[0] == ["دکتر", "۱", "a-simple"]
    assert "4 enabled agents" in out
    assert ADMIN_PW not in out and EVAL_PW not in out


def test_refuses_existing_database(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, config: str, capsys: pytest.CaptureFixture
) -> None:
    db = tmp_path / "qa" / "lab.db"  # tmp_path/lab.db belongs to the conftest fixture
    db.parent.mkdir()
    db.write_bytes(b"precious")
    assert _run(monkeypatch, db, config) == 1
    assert "already exists" in capsys.readouterr().err
    assert db.read_bytes() == b"precious"
    assert not (db.parent / "archive").exists()


def test_force_archives_and_recreates(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, config: str, capsys: pytest.CaptureFixture
) -> None:
    db = tmp_path / "qa" / "lab.db"
    assert _run(monkeypatch, db, config) == 0
    app_db.get_engine().dispose()  # release the file (Windows)
    Path(f"{db}-wal").write_bytes(b"w")  # companions move too
    assert _run(monkeypatch, db, config, f"{ADMIN_PW}\n{EVAL_PW}\n", "--force") == 0
    out = capsys.readouterr().out
    [archive] = list((db.parent / "archive").iterdir())
    assert (archive / "lab.db").is_file() and (archive / "lab.db-wal").read_bytes() == b"w"
    assert f"archived lab.db, lab.db-wal to {archive}" in out
    assert set(_users(db)) == {"boss", "dr.a"}  # a fresh DB, not duplicates


@pytest.mark.parametrize(
    "stdin,extra_argv,message",
    [
        ("short\nlong-enough-1\n", [], "at least 8 characters"),
        (f"{ADMIN_PW}\n", [], "at least 8 characters"),  # second line missing
        (f"{ADMIN_PW}\n{EVAL_PW}\n", ["--evaluator", "boss"], "must be different"),
        (f"{ADMIN_PW}\n{EVAL_PW}\n", ["--admin", " "], "must not be empty"),
    ],
)
def test_invalid_input_changes_nothing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    config: str,
    capsys: pytest.CaptureFixture,
    stdin: str,
    extra_argv: list[str],
    message: str,
) -> None:
    db = tmp_path / "qa" / "lab.db"
    db.parent.mkdir()
    db.write_bytes(b"old")
    code = _run(monkeypatch, db, config, stdin, "--force", *extra_argv)
    assert code == 1 and message in capsys.readouterr().err
    assert db.read_bytes() == b"old"  # validated before anything was archived
    assert not (db.parent / "archive").exists()


def test_invalid_config_exits_2(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("agents: nope\n", encoding="utf-8")
    db = tmp_path / "qa" / "lab.db"
    assert _run(monkeypatch, db, str(bad)) == 2
    assert "error:" in capsys.readouterr().err
    assert not db.parent.exists()
