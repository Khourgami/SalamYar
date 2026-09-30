"""`cost-report` CLI (phase 2c T4): exact aggregates on a seeded DB."""

import csv
import io
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest

from app import cli
from app import db as app_db
from app.db import models as m
from app.db.types import dumps, utcnow
from tests import fixtures as fx
from tests.helpers import make_user

# (purpose, prompt, completion, reasoning, reported cost, estimated cost)
Call = tuple[str, int | None, int | None, int | None, float | None, float | None]


def _seed_session(
    db: Any,
    user: m.User,
    n: int,
    agent: str,
    model: str,
    arch: str,
    calls: list[Call],
    *,
    final: str | None,
    questions: int,
) -> str:
    def total(i: int) -> Any:
        values = [c[i] for c in calls if c[i] is not None]
        return sum(values) if values else None

    sess = m.Session(
        user_id=user.id,
        agent_id=agent,
        agent_snapshot_json=dumps({"model": model, "architecture": arch}),
        status="completed" if final else "active",
        end_reason="agent_concluded" if final else None,
        questions_asked=questions,
        created_at=utcnow() - timedelta(minutes=10 - n),
        completed_at=utcnow() if final else None,
        total_cost_usd=total(4),
        llm_call_count=len(calls),
        total_prompt_tokens=total(1),
        total_completion_tokens=total(2),
        total_reasoning_tokens=total(3),
        total_estimated_cost_usd=total(5),
    )
    db.add(sess)
    db.flush()
    for purpose, prompt, completion, reasoning, cost, est in calls:
        db.add(
            m.LLMCall(
                session_id=sess.id,
                purpose=purpose,
                model=model,
                request_json="{}",
                parsed_ok=cost is not None,
                prompt_tokens=prompt,
                completion_tokens=completion,
                reasoning_tokens=reasoning,
                cost_usd=cost,
                estimated_cost_usd=est,
                attempt=2 if purpose == "repair" else 1,
            )
        )
    if final:
        result = dumps(fx.assessment(triage_level=final))
        guard = dumps({"raw_triage_level": final, "final_triage_level": final})
        db.add(
            m.Assessment(
                session_id=sess.id,
                result_json=result,
                raw_result_json=result,
                guard_report_json=guard,
            )
        )
    return sess.id


@pytest.fixture
def seeded(tmp_path: Path) -> tuple[str, list[str]]:
    """S1, S2: a-x (m/a, simple); S3 (+ active S4): b-y (m/b, structured); S5: a-z (m/b, simple)."""
    user = make_user("ev1")
    with app_db.session_factory()() as db:
        for agent, model, arch in [
            ("a-x", "m/a", "simple"),
            ("b-y", "m/b", "structured"),
            ("a-z", "m/b", "simple"),
        ]:
            db.add(
                m.Agent(
                    id=agent,
                    display_name=agent,
                    architecture=arch,
                    model=model,
                    config_json="{}",
                    enabled=True,
                )
            )
        db.flush()
        ids = [
            _seed_session(
                db,
                user,
                1,
                "a-x",
                "m/a",
                "simple",
                [
                    ("turn", 1000, 100, None, 0.01, 0.011),
                    ("assessment", 2000, 200, None, 0.02, 0.022),
                ],
                final="ROUTINE_DAYS",
                questions=1,
            ),
            _seed_session(
                db,
                user,
                2,
                "a-x",
                "m/a",
                "simple",
                [
                    ("turn", 1000, 100, 20, 0.02, 0.021),
                    ("assessment", None, None, None, None, None),  # failed, no usage
                ],
                final="URGENT_24H",
                questions=2,
            ),
            _seed_session(
                db,
                user,
                3,
                "b-y",
                "m/b",
                "structured",
                [
                    ("turn", 500, 50, 5, 0.01, 0.012),
                    ("repair", 600, 60, 6, 0.01, 0.012),
                    ("assessment", 700, 70, 7, 0.01, 0.012),
                ],
                final="EMERGENCY_NOW",
                questions=3,
            ),
            _seed_session(
                db,
                user,
                4,
                "b-y",
                "m/b",
                "structured",
                [("turn", 100, 10, None, 0.001, 0.001)],
                final=None,
                questions=0,
            ),
            _seed_session(
                db,
                user,
                5,
                "a-z",
                "m/b",
                "simple",
                [("turn", 100, 10, None, None, 0.002)],  # usage but no reported cost
                final="SELF_CARE",
                questions=0,
            ),
        ]
        db.commit()
    return str(tmp_path / "lab.db"), ids


def _run(capsys: pytest.CaptureFixture, *args: str) -> tuple[int, str]:
    code = cli.main(["cost-report", *args])
    return code, capsys.readouterr().out


def _table(out: str) -> dict[str, dict[str, str]]:
    """Parse the aligned table (all cells are single tokens; empty cells are ignored)."""
    lines = out.splitlines()
    header_at = next(
        i for i, line in enumerate(lines) if line.split()[:1] in (["key"], ["session_id"])
    )
    header = lines[header_at].split()
    starts = [lines[header_at].index(h) for h in header]
    rows = {}
    for line in lines[header_at + 1 :]:
        if not line.strip():
            break
        cells = [
            line[s : (starts[i + 1] if i + 1 < len(starts) else None)].strip()
            for i, s in enumerate(starts)
        ]
        rows[cells[0]] = dict(zip(header, cells, strict=True))
    return rows


EXPECTED_AGENT = {
    "a-x": {
        "sessions": "2",
        "llm_calls": "4",
        "repair_calls": "0",
        "prompt_tokens": "4000",
        "prompt_mean": "2000.0",
        "completion_tokens": "400",
        "completion_mean": "200.0",
        "reasoning_tokens": "20",
        "reasoning_mean": "20.0",
        "reported_usd": "0.050000",
        "reported_mean": "0.025000",
        "reported_median": "0.025000",
        "reported_max": "0.030000",
        "estimated_usd": "0.054000",
        "estimated_mean": "0.027000",
        "diff_pct": "8.0",
        "flag": "",
    },
    "b-y": {
        "sessions": "1",
        "llm_calls": "3",
        "repair_calls": "1",
        "prompt_tokens": "1800",
        "prompt_mean": "1800.0",
        "completion_tokens": "180",
        "completion_mean": "180.0",
        "reasoning_tokens": "18",
        "reasoning_mean": "18.0",
        "reported_usd": "0.030000",
        "reported_mean": "0.030000",
        "reported_median": "0.030000",
        "reported_max": "0.030000",
        "estimated_usd": "0.036000",
        "estimated_mean": "0.036000",
        "diff_pct": "20.0",
        "flag": ">15%",
    },
    "a-z": {
        "sessions": "1",
        "llm_calls": "1",
        "repair_calls": "0",
        "prompt_tokens": "100",
        "prompt_mean": "100.0",
        "completion_tokens": "10",
        "completion_mean": "10.0",
        "reasoning_tokens": "",
        "reasoning_mean": "",
        "reported_usd": "",
        "reported_mean": "",
        "reported_median": "",
        "reported_max": "",
        "estimated_usd": "0.002000",
        "estimated_mean": "0.002000",
        "diff_pct": "",  # no call has both values
        "flag": "",
    },
}


def test_by_agent_default(seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture) -> None:
    path, _ = seeded
    code, out = _run(capsys, "--db", path)
    assert code == 0
    assert out.startswith("Cost report by agent — completed sessions")
    rows = _table(out)
    assert list(rows) == ["a-x", "a-z", "b-y"]  # sorted keys
    for key, expected in EXPECTED_AGENT.items():
        assert {k: v for k, v in rows[key].items() if k != "key"} == expected, key


def test_by_model(seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture) -> None:
    path, _ = seeded
    rows = _table(_run(capsys, "--db", path, "--by", "model")[1])
    assert list(rows) == ["m/a", "m/b"]
    assert rows["m/a"]["reported_usd"] == "0.050000"
    b = rows["m/b"]  # S3 + S5
    assert (b["sessions"], b["llm_calls"], b["repair_calls"]) == ("2", "4", "1")
    assert (b["prompt_tokens"], b["prompt_mean"]) == ("1900", "950.0")
    assert (b["reasoning_tokens"], b["reasoning_mean"]) == ("18", "18.0")
    assert (b["reported_usd"], b["reported_mean"], b["reported_max"]) == (
        "0.030000",
        "0.030000",
        "0.030000",
    )
    assert (b["estimated_usd"], b["estimated_mean"]) == ("0.038000", "0.019000")
    assert (b["diff_pct"], b["flag"]) == ("20.0", ">15%")  # only S3's calls have both


def test_by_architecture(seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture) -> None:
    path, _ = seeded
    rows = _table(_run(capsys, "--db", path, "--by", "architecture")[1])
    assert list(rows) == ["simple", "structured"]
    s = rows["simple"]  # S1, S2, S5
    assert (s["sessions"], s["llm_calls"]) == ("3", "5")
    assert (s["prompt_tokens"], s["prompt_mean"]) == ("4100", "1366.7")
    assert (s["completion_tokens"], s["completion_mean"]) == ("410", "136.7")
    assert (s["reported_usd"], s["reported_median"]) == ("0.050000", "0.025000")
    assert (s["estimated_usd"], s["estimated_mean"]) == ("0.056000", "0.018667")
    assert (s["diff_pct"], s["flag"]) == ("8.0", "")
    assert rows["structured"]["flag"] == ">15%"


def test_status_all_includes_active(
    seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture
) -> None:
    path, _ = seeded
    rows = _table(_run(capsys, "--db", path, "--status", "all")[1])
    b = rows["b-y"]  # S3 + active S4
    assert (b["sessions"], b["llm_calls"], b["prompt_tokens"], b["prompt_mean"]) == (
        "2",
        "4",
        "1900",
        "950.0",
    )
    assert (b["reported_usd"], b["reported_median"]) == ("0.031000", "0.015500")
    assert b["diff_pct"] == "19.4"  # (0.037 − 0.031) / 0.031


def test_by_session(seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture) -> None:
    path, ids = seeded
    code, out = _run(capsys, "--db", path, "--by", "session")
    assert code == 0
    rows = _table(out)
    assert list(rows) == [ids[0], ids[1], ids[2], ids[4]]  # created_at order, active excluded
    s3 = rows[ids[2]]
    assert s3 == {
        "session_id": ids[2],
        "agent_id": "b-y",
        "model": "m/b",
        "architecture": "structured",
        "status": "completed",
        "end_reason": "agent_concluded",
        "questions": "3",
        "final_triage_level": "EMERGENCY_NOW",
        "llm_calls": "3",
        "prompt_tokens": "1800",
        "completion_tokens": "180",
        "reasoning_tokens": "18",
        "reported_usd": "0.030000",
        "estimated_usd": "0.036000",
    }
    assert rows[ids[4]]["reported_usd"] == "" and rows[ids[4]]["reasoning_tokens"] == ""
    assert "diff_pct" not in out
    out_all = _run(capsys, "--db", path, "--by", "session", "--status", "all")[1]
    active = _table(out_all)[ids[3]]
    assert (active["status"], active["end_reason"], active["final_triage_level"]) == (
        "active",
        "",
        "",
    )


@pytest.mark.parametrize("by", ["agent", "session"])
def test_csv_matches_table(
    seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture, tmp_path: Path, by: str
) -> None:
    path, _ = seeded
    out_csv = tmp_path / "report.csv"
    code, out = _run(capsys, "--db", path, "--by", by, "--csv", str(out_csv))
    assert code == 0 and f"wrote {out_csv}" in out
    raw = out_csv.read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    table = _table(out)
    assert rows[0] == list(next(iter(table.values())).keys())
    assert {r[0]: dict(zip(rows[0], r, strict=True)) for r in rows[1:]} == table


def test_empty_db(capsys: pytest.CaptureFixture, tmp_path: Path) -> None:
    code, out = _run(capsys, "--db", str(tmp_path / "lab.db"))
    assert code == 0
    assert out.strip() == f"no sessions (completed sessions) in {tmp_path / 'lab.db'}"


def test_missing_db_and_old_schema(capsys: pytest.CaptureFixture, tmp_path: Path) -> None:
    assert cli.main(["cost-report", "--db", str(tmp_path / "nope.db")]) == 2
    assert "database not found" in capsys.readouterr().err
    old = tmp_path / "old.db"
    import sqlite3

    con = sqlite3.connect(old)
    con.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
    con.close()
    assert cli.main(["cost-report", "--db", str(old)]) == 2
    assert "older than v1.2" in capsys.readouterr().err


def test_database_path_from_env(
    seeded: tuple[str, list[str]], capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    path, _ = seeded
    monkeypatch.setenv("DATABASE_PATH", path)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)  # works without the key
    code, out = _run(capsys, "--by", "architecture")
    assert code == 0 and path in out.splitlines()[0]
