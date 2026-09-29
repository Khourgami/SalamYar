import csv
import io
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest

from app import db as app_db
from app.db import models as m
from app.db.types import dumps, loads, utcnow
from app.services.metrics_service import percentile
from tests import fixtures as fx
from tests.lab import TEST_AGENTS, Lab

# --- access --------------------------------------------------------------------------------

ADMIN_ROUTES = [
    ("GET", "/admin/sessions"),
    ("GET", "/admin/sessions/x"),
    ("GET", "/admin/metrics"),
    ("GET", "/admin/export/sessions.csv"),
    ("POST", "/admin/agents/reload"),
]


@pytest.mark.parametrize("method,url", ADMIN_ROUTES)
def test_admin_only(lab: Lab, method: str, url: str) -> None:
    r = lab.req(method, url, "ev1")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
    assert lab.client.request(method, f"/api/v1{url}").status_code == 401


# --- admin sessions ------------------------------------------------------------------------


def test_admin_sessions_list_and_detail(lab: Lab) -> None:
    lab.user("boss", "admin")
    s1 = lab.completed_session("a-simple", "ev1")
    s2 = lab.create("b-struct", "ev2")["id"]
    body = lab.req("GET", "/admin/sessions", "boss").json()
    assert body["total"] == 2
    by_id = {s["id"]: s for s in body["items"]}
    assert by_id[s1]["user"]["username"] == "ev1"
    assert by_id[s1]["agent_reveal"]["architecture"] == "simple"
    assert by_id[s2]["agent_reveal"]["model"] == "test/struct-model"
    assert by_id[s1]["final_triage_level"] == "ROUTINE_DAYS"

    ev2 = lab.users["ev2"].id
    assert [
        s["id"] for s in lab.req("GET", f"/admin/sessions?user_id={ev2}", "boss").json()["items"]
    ] == [s2]
    assert lab.req("GET", "/admin/sessions?agent_id=a-simple", "boss").json()["total"] == 1
    assert lab.req("GET", "/admin/sessions?status=active", "boss").json()["total"] == 1
    assert lab.req("GET", "/admin/sessions?evaluated=true", "boss").json()["total"] == 0

    # detail: reveal always, feedback from all users
    qid = next(
        msg["id"]
        for msg in lab.req("GET", f"/sessions/{s1}").json()["messages"]
        if msg["kind"] == "question"
    )
    lab.req("PUT", f"/messages/{qid}/feedback", "ev1", json={"rating": "up", "note": None})
    detail = lab.req("GET", f"/admin/sessions/{s1}", "boss").json()
    assert detail["reveal"]["architecture"] == "simple"
    assert len(detail["feedback"]) == 1
    assert detail["backstage"] is not None
    # the normal endpoint is owner-only for admins too (D-020)
    assert lab.req("GET", f"/sessions/{s1}", "boss").status_code == 403
    assert lab.req("GET", "/admin/sessions/missing", "boss").status_code == 404


# --- metrics -------------------------------------------------------------------------------


def _session(
    db: Any,
    user: m.User,
    agent: str,
    snapshot: dict[str, Any],
    *,
    final: str | None,
    verdict: str | None = None,
    verdict_specialty: str = "neurology",
    specialty: tuple[str, str | None] = ("neurology", None),
    latencies: tuple[int, ...] = (),
    cost: float | None = None,
    questions: int = 0,
    escalated: bool = False,
    scores: dict[str, int] | None = None,
    flags: dict[str, bool] | None = None,
    comparison: dict[str, str] | None = None,
    feedback: tuple[str, ...] = (),
) -> str:
    now = utcnow()
    sess = m.Session(
        user_id=user.id,
        agent_id=agent,
        agent_snapshot_json=dumps(snapshot),
        status="completed" if final else "active",
        questions_asked=questions,
        created_at=now - timedelta(minutes=5),
        completed_at=now if final else None,
        total_cost_usd=cost,
    )
    db.add(sess)
    db.flush()
    for i, latency in enumerate(latencies):
        msg = m.Message(
            session_id=sess.id,
            seq=i + 1,
            role="agent",
            kind="question",
            text="q",
            latency_ms=latency,
        )
        db.add(msg)
        db.flush()
        if i < len(feedback):
            db.add(m.MessageFeedback(message_id=msg.id, user_id=user.id, rating=feedback[i]))
    if final:
        result = fx.assessment(
            triage_level=final, specialty_primary=specialty[0], specialty_secondary=specialty[1]
        )
        guard = {
            "raw_triage_level": final,
            "final_triage_level": final,
            "actions": ["safety_floor_escalation"] if escalated else [],
            "flags": [],
        }
        db.add(
            m.Assessment(
                session_id=sess.id,
                result_json=dumps(result),
                raw_result_json=dumps(result),
                guard_report_json=dumps(guard),
            )
        )
    if verdict:
        data = fx.evaluation(
            doctor_verdict={
                "triage_level": verdict,
                "specialty": verdict_specialty,
                "main_diagnosis": None,
            },
            comparison=comparison,
        )
        if scores:
            data["scores"] = {**data["scores"], **scores}
        if flags:
            data["safety_flags"] = {**data["safety_flags"], **flags}
        db.add(m.Evaluation(session_id=sess.id, user_id=user.id, data_json=dumps(data)))
    db.flush()
    return sess.id


@pytest.fixture
def metrics_lab(lab: Lab) -> Lab:
    lab.user("boss", "admin")
    ev = lab.user("ev1")
    snaps = {a.id: a.model_dump(mode="json") for a in lab.registry.all()}
    all4 = dict.fromkeys(fx.evaluation()["scores"], 4)
    with app_db.session_factory()() as db:
        # a-simple (simple, test/simple-model)
        _session(
            db,
            ev,
            "a-simple",
            snaps["a-simple"],
            final="ROUTINE_DAYS",
            verdict="URGENT_24H",
            latencies=(1000, 3000),
            cost=0.01,
            questions=2,
            scores={**all4, "overall_trust": 2},
            flags={"dangerous_undertriage": True},
            feedback=("up",),
        )
        s2 = _session(
            db,
            ev,
            "a-simple",
            snaps["a-simple"],
            final="EMERGENCY_NOW",
            verdict="EMERGENCY_NOW",
            verdict_specialty="cardiology",
            specialty=("neurology", "cardiology"),
            latencies=(2000,),
            cost=0.03,
            questions=4,
            escalated=True,
            scores=dict.fromkeys(all4, 5),
            feedback=("down",),
        )
        _session(
            db,
            ev,
            "a-simple",
            snaps["a-simple"],
            final="INSUFFICIENT_INFO",
            verdict="SELF_CARE",
            verdict_specialty="ent",
            latencies=(5000,),
            cost=None,
            questions=0,
            scores=dict.fromkeys(all4, 3),
        )
        _session(db, ev, "a-simple", snaps["a-simple"], final=None, latencies=(4000,), questions=1)
        # b-capped (structured, test/b-capped): S6 completed not evaluated; S5 compared to S6
        s6 = _session(db, ev, "b-capped", snaps["b-capped"], final="SELF_CARE", questions=2)
        s5 = _session(
            db,
            ev,
            "b-capped",
            snaps["b-capped"],
            final="SELF_CARE",
            verdict="SELF_CARE",
            questions=1,
            comparison={"compared_session_id": s6, "winner": "other"},
        )
        # b-struct (structured, test/struct-model): over-triage, tie with S5
        s4 = _session(
            db,
            ev,
            "b-struct",
            snaps["b-struct"],
            final="URGENT_24H",
            verdict="SELF_CARE",
            questions=3,
            comparison={"compared_session_id": s5, "winner": "tie"},
        )
        # S2 (a-simple) beat S4 (b-struct)
        ev2 = db.query(m.Evaluation).filter_by(session_id=s2).one()
        data = loads(ev2.data_json)
        data["comparison"] = {"compared_session_id": s4, "winner": "this"}
        ev2.data_json = dumps(data)
        db.commit()
    return lab


def _rows(lab: Lab, group_by: str | None = None) -> dict[str, dict[str, Any]]:
    url = "/admin/metrics" + (f"?group_by={group_by}" if group_by else "")
    r = lab.req("GET", url, "boss")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["group_by"] == (group_by or "agent")
    assert body["generated_at"]
    return {row["key"]: row for row in body["rows"]}


def test_metrics_by_agent(metrics_lab: Lab) -> None:
    rows = _rows(metrics_lab)
    assert set(rows) == {"a-simple", "b-struct", "a-capped", "b-capped"}  # enabled agents

    a = rows["a-simple"]
    assert (a["label"], a["architecture"], a["model"]) == ("دکتر ۱", "simple", "test/simple-model")
    assert a["sessions_total"] == 4 and a["sessions_evaluated"] == 3
    assert a["triage_exact_rate"] == 0.5
    assert a["undertriage_rate"] == 0.5
    assert a["overtriage_rate"] == 0.0
    assert a["undertriage_emergency_rate"] == 0.0
    assert a["insufficient_info_count"] == 1
    assert a["specialty_match_rate"] == pytest.approx(2 / 3)
    assert a["mean_scores"]["efficiency"] == pytest.approx(4.0)
    assert a["mean_scores"]["overall_trust"] == pytest.approx(10 / 3)
    assert a["safety_flag_counts"] == {
        "dangerous_undertriage": 1,
        "medication_or_treatment_advice": 0,
        "definitive_diagnosis_claim": 0,
        "medically_incorrect_information": 0,
        "irrelevant_or_inappropriate_content": 0,
    }
    assert a["mean_questions"] == 2.0
    assert a["turn_latency_p50_ms"] == 3000
    assert a["turn_latency_p90_ms"] == 5000
    assert a["mean_cost_usd"] == pytest.approx(0.02)
    assert (a["feedback_up"], a["feedback_down"]) == (1, 1)
    assert a["pairwise"] == {"wins": 1, "losses": 0, "ties": 0}
    assert a["safety_floor_escalations"] == 1

    b = rows["b-struct"]
    assert (
        b["overtriage_rate"] == 1.0
        and b["undertriage_rate"] == 0.0
        and b["triage_exact_rate"] == 0.0
    )
    assert b["undertriage_emergency_rate"] is None  # null denominator
    assert b["pairwise"] == {"wins": 0, "losses": 1, "ties": 1}
    assert b["mean_cost_usd"] is None
    assert b["turn_latency_p50_ms"] is None

    c = rows["b-capped"]
    assert c["sessions_total"] == 2 and c["sessions_evaluated"] == 1
    assert c["triage_exact_rate"] == 1.0
    assert c["pairwise"] == {"wins": 0, "losses": 0, "ties": 1}  # S5 vs S6 is same group → skipped
    assert c["mean_questions"] == 1.5

    empty = rows["a-capped"]
    assert empty["sessions_total"] == 0 and empty["sessions_evaluated"] == 0
    assert empty["triage_exact_rate"] is None and empty["specialty_match_rate"] is None
    assert empty["mean_scores"]["communication"] is None
    assert empty["mean_questions"] is None
    assert empty["pairwise"] == {"wins": 0, "losses": 0, "ties": 0}


def test_metrics_by_architecture(metrics_lab: Lab) -> None:
    rows = _rows(metrics_lab, "architecture")
    assert set(rows) == {"simple", "structured"}
    s = rows["structured"]
    assert (s["label"], s["architecture"], s["model"]) == ("structured", "structured", None)
    assert s["sessions_total"] == 3 and s["sessions_evaluated"] == 2
    assert s["triage_exact_rate"] == 0.5 and s["overtriage_rate"] == 0.5
    assert s["pairwise"] == {"wins": 0, "losses": 1, "ties": 0}  # S4–S5 tie is intra-group
    assert rows["simple"]["pairwise"] == {"wins": 1, "losses": 0, "ties": 0}
    assert rows["simple"]["sessions_total"] == 4


def test_metrics_by_model(metrics_lab: Lab) -> None:
    rows = _rows(metrics_lab, "model")
    assert set(rows) == {"test/simple-model", "test/struct-model", "test/b-capped", "test/capped"}
    sm = rows["test/struct-model"]
    assert (sm["label"], sm["architecture"], sm["model"]) == (
        "test/struct-model",
        None,
        "test/struct-model",
    )
    assert sm["pairwise"] == {"wins": 0, "losses": 1, "ties": 1}
    assert rows["test/b-capped"]["pairwise"] == {"wins": 0, "losses": 0, "ties": 1}
    assert rows["test/simple-model"]["pairwise"] == {"wins": 1, "losses": 0, "ties": 0}


def test_metrics_invalid_group_by(metrics_lab: Lab) -> None:
    assert metrics_lab.req("GET", "/admin/metrics?group_by=user", "boss").status_code == 400


def test_percentile_nearest_rank() -> None:
    assert percentile([], 50) is None
    assert percentile([7], 90) == 7
    assert percentile([1, 2, 3, 4], 50) == 2
    assert percentile([15, 20, 35, 40, 50], 30) == 20
    assert percentile([15, 20, 35, 40, 50], 90) == 50
    assert percentile([3, 1, 2], 0) == 1


# --- export --------------------------------------------------------------------------------


def _csv(lab: Lab, table: str) -> tuple[list[str], list[list[str]], Any]:
    r = lab.req("GET", f"/admin/export/{table}.csv", "boss")
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"\xef\xbb\xbf")  # BOM
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    return rows[0], rows[1:], r


@pytest.mark.parametrize(
    "table,count",
    [
        ("sessions", 1),
        ("messages", 5),
        ("llm_calls", 2),
        ("assessments", 1),
        ("evaluations", 1),
        ("feedback", 1),
    ],
)
def test_export_tables(lab: Lab, table: str, count: int) -> None:
    lab.user("boss", "admin")
    sid = lab.completed_session()
    qid = next(
        x["id"]
        for x in lab.req("GET", f"/sessions/{sid}").json()["messages"]
        if x["kind"] == "question"
    )
    lab.req("PUT", f"/messages/{qid}/feedback", json={"rating": "up", "note": "خوب"})
    lab.req("POST", f"/sessions/{sid}/evaluation", json=fx.evaluation())
    header, rows, resp = _csv(lab, table)
    assert resp.headers["content-type"].startswith("text/csv")
    assert "charset=utf-8" in resp.headers["content-type"]
    assert len(rows) == count
    assert "id" in header
    assert all(len(r) == len(header) for r in rows)


def test_export_persian_and_json_columns(lab: Lab) -> None:
    lab.user("boss", "admin")
    lab.completed_session()
    header, rows, _ = _csv(lab, "messages")
    texts = [r[header.index("text")] for r in rows]
    assert "سردرد دارم" in texts
    header, rows, _ = _csv(lab, "assessments")
    result = rows[0][header.index("result_json")]
    assert "میگرن" in result  # ensure_ascii=False → readable Persian
    assert loads(result)["triage_level"] == "ROUTINE_DAYS"
    header, rows, _ = _csv(lab, "sessions")
    assert rows[0][header.index("turn_in_progress")] == "false"
    assert rows[0][header.index("end_reason")] == "agent_concluded"


def test_export_llm_calls_contains_no_secrets(lab: Lab) -> None:
    lab.user("boss", "admin")
    lab.completed_session()
    header, rows, resp = _csv(lab, "llm_calls")
    body = resp.content.decode("utf-8-sig")
    assert "sk-or-test-SECRET-KEY-123" not in body
    assert "test-jwt-secret" not in body
    assert "Authorization" not in body
    req = loads(rows[0][header.index("request_json")])
    assert req["model"] == "test/simple-model" and req["messages"][0]["role"] == "system"


def test_export_unknown_table(lab: Lab) -> None:
    lab.user("boss", "admin")
    assert lab.req("GET", "/admin/export/users.csv", "boss").status_code == 404


# --- reload --------------------------------------------------------------------------------


def test_reload_valid_and_invalid(lab: Lab) -> None:
    lab.user("boss", "admin")
    path = Path(lab.registry.path)
    r = lab.req("POST", "/admin/agents/reload", "boss")
    assert r.status_code == 200 and r.json() == {"loaded": 5, "enabled": 4}

    path.write_text(
        TEST_AGENTS.replace(
            "  - id: a-off",
            "  - id: a-new\n"
            '    display_name: "دکتر ۶"\n'
            "    architecture: simple\n"
            "    model: test/new\n"
            "  - id: a-off",
        ),
        encoding="utf-8",
    )
    assert lab.req("POST", "/admin/agents/reload", "boss").json() == {"loaded": 6, "enabled": 5}
    assert "a-new" in [a["id"] for a in lab.req("GET", "/agents").json()]
    with app_db.session_factory()() as db:
        assert db.get(m.Agent, "a-new") is not None

    path.write_text(
        TEST_AGENTS.replace("architecture: simple", "architecture: panel", 1), encoding="utf-8"
    )
    r = lab.req("POST", "/admin/agents/reload", "boss")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "previous config kept" in r.json()["error"]["message"]
    assert len(lab.req("GET", "/agents").json()) == 5  # previous config still active
