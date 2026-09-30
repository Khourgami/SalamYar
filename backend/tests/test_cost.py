"""Token and cost accounting (D-035, contract v1.2): prices, per-call estimates, session totals."""

from pathlib import Path

from app import db as app_db
from app.db import models as m
from app.db.types import loads
from tests.lab import TEST_AGENTS, Lab


def _snapshot(sid: str) -> dict:
    with app_db.session_factory()() as db:
        sess = db.get(m.Session, sid)
        assert sess is not None
        return loads(sess.agent_snapshot_json)


# --- T1: pricing in the session snapshot ---------------------------------------------------


def test_snapshot_contains_prices(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]
    assert _snapshot(sid)["pricing"] == {
        "input_per_mtok": 2.0,
        "output_per_mtok": 8.0,
        "source": "t",
        "as_of": "2026-09-30",
    }


def test_reload_with_new_prices_affects_only_new_sessions(lab: Lab) -> None:
    old = lab.create("a-simple")["id"]
    Path(lab.registry.path).write_text(
        TEST_AGENTS.replace(
            "test/simple-model: { input_per_mtok: 1.0, output_per_mtok: 4.0",
            "test/simple-model: { input_per_mtok: 3.0, output_per_mtok: 9.0",
        ),
        encoding="utf-8",
    )
    lab.user("boss", "admin")
    assert lab.req("POST", "/admin/agents/reload", "boss").status_code == 200
    new = lab.create("a-simple")["id"]
    assert _snapshot(old)["pricing"]["input_per_mtok"] == 1.0
    assert _snapshot(new)["pricing"]["input_per_mtok"] == 3.0
    assert _snapshot(new)["pricing"]["output_per_mtok"] == 9.0
