import json

from sqlalchemy import select, update

from app import db as app_db
from app.agents.texts_fa import DISCLAIMER_FA, ERROR_FA, GREETING_FA
from app.db import models as m
from app.db.types import loads
from app.llm.client import LLMError
from app.services.session_service import shuffle_key
from tests import fixtures as fx
from tests.lab import ASK, ASSESSMENT, B_ASK, B_CONCLUDE, CONCLUDE, Lab


def _db_rows(model, **where):  # type: ignore[no-untyped-def]
    with app_db.session_factory()() as s:
        q = select(model)
        for k, v in where.items():
            q = q.where(getattr(model, k) == v)
        return list(s.scalars(q))


# --- agents --------------------------------------------------------------------------------


def test_agents_enabled_only_and_stable_per_user_order(lab: Lab) -> None:
    r1 = lab.req("GET", "/agents", "ev1")
    assert r1.status_code == 200
    ids1 = [a["id"] for a in r1.json()]
    assert set(ids1) == {"a-simple", "b-struct", "a-capped", "b-capped"}
    assert r1.json()[0].keys() == {"id", "display_name", "description"}
    assert [a["id"] for a in lab.req("GET", "/agents", "ev1").json()] == ids1

    u1, u2 = lab.user("ev1"), lab.user("ev2")
    for u, name in ((u1, "ev1"), (u2, "ev2")):
        expected = sorted(ids1, key=lambda a, uid=u.id: shuffle_key(uid, a))
        assert [a["id"] for a in lab.req("GET", "/agents", name).json()] == expected


def test_agents_order_differs_between_fixed_users() -> None:
    agents = ["a-simple", "b-struct", "a-capped", "b-capped"]
    order1 = sorted(agents, key=lambda a: shuffle_key("user-1", a))
    order2 = sorted(agents, key=lambda a: shuffle_key("user-2", a))
    assert order1 != order2
    assert order1 == sorted(agents, key=lambda a: shuffle_key("user-1", a))


def test_agents_requires_auth(lab: Lab) -> None:
    assert lab.client.get("/api/v1/agents").status_code == 401


# --- create / get / list -------------------------------------------------------------------


def test_create_session(lab: Lab) -> None:
    body = lab.create("b-struct")
    assert body["status"] == "active"
    assert body["agent"] == {"id": "b-struct", "display_name": "دکتر ۲", "description": None}
    assert body["questions_asked"] == 0
    assert body["evaluated"] is False
    assert body["result"] is None and body["backstage"] is None and body["reveal"] is None
    assert body["first_patient_message"] is None and body["final_triage_level"] is None
    assert body["feedback"] == [] and body["evaluation"] is None
    [greeting] = body["messages"]
    assert greeting["seq"] == 1 and greeting["role"] == "agent" and greeting["kind"] == "greeting"
    assert greeting["text"] == GREETING_FA and greeting["latency_ms"] is None
    assert lab.llm.requests == []
    sess = _db_rows(m.Session, id=body["id"])[0]
    snap = loads(sess.agent_snapshot_json)
    assert snap["model"] == "test/struct-model" and snap["options"]["max_questions"] == 12
    assert sess.clinical_state_json == "{}"


def test_create_session_unknown_or_disabled_agent(lab: Lab) -> None:
    for agent in ("nope", "a-off"):
        r = lab.req("POST", "/sessions", json={"agent_id": agent})
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"


def test_get_session_access(lab: Lab) -> None:
    sid = lab.create()["id"]
    lab.user("ev2")
    lab.user("boss", "admin")
    assert lab.req("GET", f"/sessions/{sid}").status_code == 200
    r = lab.req("GET", f"/sessions/{sid}", "ev2")
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    r = lab.req("GET", f"/sessions/{sid}", "boss")  # owner-only for admins too (D-020)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert lab.req("GET", "/sessions/does-not-exist").status_code == 404


def test_other_users_cannot_post(lab: Lab) -> None:
    sid = lab.create()["id"]
    lab.user("ev2")
    assert lab.send(sid, "سلام", "ev2").status_code == 403
    assert lab.finish(sid, "ev2").status_code == 403


def test_list_sessions_filters(lab: Lab) -> None:
    active = lab.create()["id"]
    done = lab.completed_session()
    lab.create(who="ev2")
    r = lab.req("GET", "/sessions").json()
    assert r["total"] == 2
    assert {s["id"] for s in r["items"]} == {active, done}
    by_id = {s["id"]: s for s in r["items"]}
    assert by_id[done]["first_patient_message"] == "سردرد دارم"
    assert by_id[done]["final_triage_level"] == "ROUTINE_DAYS"
    assert by_id[active]["first_patient_message"] is None
    assert "messages" not in by_id[active]
    assert [s["id"] for s in lab.req("GET", "/sessions?status=completed").json()["items"]] == [done]
    assert lab.req("GET", "/sessions?evaluated=true").json()["total"] == 0
    assert lab.req("GET", "/sessions?evaluated=false").json()["total"] == 2
    page = lab.req("GET", "/sessions?limit=1&offset=1").json()
    assert page["total"] == 2 and len(page["items"]) == 1
    assert lab.req("GET", "/sessions?status=bogus").status_code == 400
    assert lab.req("GET", "/sessions?limit=0").status_code == 400


# --- lifecycle -----------------------------------------------------------------------------


def test_simple_lifecycle(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(ASK, ASK, CONCLUDE)

    r1 = lab.send(sid, "  از دیروز سردرد دارم  ")
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["patient_message"]["text"] == "از دیروز سردرد دارم"  # trimmed
    assert b1["patient_message"]["kind"] == "text" and b1["patient_message"]["latency_ms"] is None
    assert b1["agent_message"]["kind"] == "question" and b1["agent_message"]["seq"] == 3
    assert b1["agent_message"]["latency_ms"] is not None
    assert b1["session"]["questions_asked"] == 1
    assert b1["session"]["backstage"] is None and b1["session"]["result"] is None

    assert lab.send(sid, "درد ۵ از ۱۰").json()["session"]["questions_asked"] == 2
    r3 = lab.send(sid, "تب ندارم")
    assert r3.status_code == 200
    b3 = r3.json()
    assert b3["agent_message"]["kind"] == "result"
    assert b3["agent_message"]["text"].endswith(DISCLAIMER_FA)
    s = b3["session"]
    assert s["status"] == "completed" and s["end_reason"] == "agent_concluded"
    assert s["completed_at"] is not None and s["questions_asked"] == 2
    assert s["final_triage_level"] == "ROUTINE_DAYS"
    assert [msg["seq"] for msg in s["messages"]] == list(range(1, 8))

    card = s["result"]
    assert card["assessment"]["triage_level"] == "ROUTINE_DAYS"
    assert card["guard"] == {
        "raw_triage_level": "ROUTINE_DAYS",
        "final_triage_level": "ROUTINE_DAYS",
        "actions": [],
        "flags": [],
    }
    assert card["stats"]["questions_asked"] == 2
    assert set(card["stats"]) == {
        "questions_asked",
        "duration_seconds",
        "mean_turn_latency_ms",
        "total_cost_usd",
        "llm_calls",
        "prompt_tokens",
        "completion_tokens",
        "reasoning_tokens",
    }
    assert card["stats"]["total_cost_usd"] is None  # hidden until evaluated (D-035)
    assert card["stats"]["duration_seconds"] >= 0
    assert card["stats"]["mean_turn_latency_ms"] is not None

    agent_ids = [msg["id"] for msg in s["messages"] if msg["kind"] in ("question", "result")]
    assert [b["message_id"] for b in s["backstage"]] == agent_ids
    assert s["backstage"][0] == {"message_id": agent_ids[0], "reasoning_note": "Leading: migraine."}
    assert s["reveal"] is None  # not evaluated yet

    # the LLM saw the greeting + alternating transcript
    last_req = lab.llm.requests[-1]
    assert [msg.role for msg in last_req.messages] == ["system"] + ["assistant", "user"] * 3

    sess = _db_rows(m.Session, id=sid)[0]
    assert sess.turn_in_progress is False
    assert sess.total_cost_usd == 0.003 and sess.total_llm_latency_ms == 15
    calls = _db_rows(m.LLMCall, session_id=sid)
    assert len(calls) == 3 and all(c.parsed_ok and c.message_id for c in calls)
    assert {c.message_id for c in calls} == set(agent_ids)
    [assessment] = _db_rows(m.Assessment, session_id=sid)
    assert loads(assessment.raw_result_json)["triage_level"] == "ROUTINE_DAYS"


def test_structured_lifecycle(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]
    ask2 = fx.js(fx.turn_decision("ask", hypotheses=[fx.hypothesis("Cluster headache", 0.3)]))
    lab.llm.push(B_ASK, ask2, B_CONCLUDE, ASSESSMENT)

    assert lab.send(sid, "سردرد دارم").json()["agent_message"]["kind"] == "question"
    sess = _db_rows(m.Session, id=sid)[0]
    assert loads(sess.clinical_state_json)["age_years"] == 35  # state persisted

    assert lab.send(sid, "کم‌کم شروع شد").status_code == 200
    # the second turn call carried the hypotheses from the first turn
    payload2 = json.loads(lab.llm.requests[1].messages[1].content)
    assert payload2["previous_hypotheses"][0]["name_en"] == "Migraine"
    assert payload2["questions_asked"] == 1
    assert payload2["clinical_state"]["age_years"] == 35

    r = lab.send(sid, "نه")
    assert r.status_code == 200
    s = r.json()["session"]
    payload3 = json.loads(lab.llm.requests[2].messages[1].content)
    assert payload3["previous_hypotheses"][0]["name_en"] == "Cluster headache"
    assert s["status"] == "completed" and s["end_reason"] == "agent_concluded"
    assert s["questions_asked"] == 2
    assert len(lab.llm.requests) == 4
    assert json.loads(lab.llm.requests[3].messages[1].content)["end_reason"] == "agent_concluded"
    bs = s["backstage"]
    assert len(bs) == 3
    assert bs[0]["next_action"] == "ask" and "clinical_state" in bs[0]
    assert "message_to_patient" not in bs[0]
    assert bs[2]["next_action"] == "conclude" and bs[2]["stop_reason"] == "enough_information"
    purposes = [c.purpose for c in _db_rows(m.LLMCall, session_id=sid)]
    assert sorted(purposes) == ["assessment", "turn", "turn", "turn"]


def test_max_questions_cap_simple(lab: Lab) -> None:
    sid = lab.create("a-capped")["id"]
    lab.llm.push(ASK, ASK, CONCLUDE)
    assert lab.send(sid, "یک").json()["session"]["questions_asked"] == 1
    assert lab.send(sid, "دو").json()["session"]["questions_asked"] == 2
    r = lab.send(sid, "سه")
    s = r.json()["session"]
    assert r.json()["agent_message"]["kind"] == "result"
    assert s["status"] == "completed" and s["end_reason"] == "max_questions"
    assert s["questions_asked"] == 2
    forced_req = lab.llm.requests[-1]
    assert forced_req.messages[-1].content == 'Conclude now. Set action to "conclude".'
    assert forced_req.messages[-2].content == "سه"


def test_max_questions_cap_structured_forces_assessment_only(lab: Lab) -> None:
    sid = lab.create("b-capped")["id"]
    lab.llm.push(B_ASK, B_ASK, ASSESSMENT)
    lab.send(sid, "یک")
    lab.send(sid, "دو")
    s = lab.send(sid, "سه").json()["session"]
    assert s["end_reason"] == "max_questions"
    assert len(lab.llm.requests) == 3
    assert json.loads(lab.llm.requests[2].messages[1].content)["end_reason"] == "max_questions"
    assert s["backstage"][-1] == {
        "message_id": s["messages"][-1]["id"],
        "next_action": "conclude",
        "stop_reason": None,
    }


def test_finish(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(ASK, CONCLUDE)
    lab.send(sid, "سردرد")
    r = lab.finish(sid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["patient_message"] is None
    assert body["agent_message"]["kind"] == "result"
    assert body["session"]["end_reason"] == "evaluator_ended"
    assert lab.llm.requests[-1].messages[-1].content == 'Conclude now. Set action to "conclude".'
    # finishing again → 409
    r2 = lab.finish(sid)
    assert r2.status_code == 409 and r2.json()["error"]["code"] == "SESSION_COMPLETED"


def test_finish_structured_right_after_greeting(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]
    lab.llm.push(ASSESSMENT)
    body = lab.finish(sid).json()
    assert body["session"]["end_reason"] == "evaluator_ended"
    payload = json.loads(lab.llm.requests[0].messages[1].content)
    assert payload["end_reason"] == "evaluator_ended"
    assert payload["clinical_state"]["symptoms"] == []


def test_turn_in_progress(lab: Lab) -> None:
    sid = lab.create()["id"]
    with app_db.session_factory()() as s:
        s.execute(update(m.Session).where(m.Session.id == sid).values(turn_in_progress=True))
        s.commit()
    for r in (lab.send(sid, "سلام"), lab.finish(sid)):
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "TURN_IN_PROGRESS"
    assert lab.llm.requests == []
    assert [msg.kind for msg in _db_rows(m.Message, session_id=sid)] == ["greeting"]


def test_post_to_completed_session(lab: Lab) -> None:
    sid = lab.completed_session()
    r = lab.send(sid, "سلام")
    assert r.status_code == 409 and r.json()["error"]["code"] == "SESSION_COMPLETED"


def test_agent_error_then_resend_reuses_patient_message(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push("not json", "still not json")
    r = lab.send(sid, "دلم درد می‌کند")
    assert r.status_code == 502
    body = r.json()
    assert body["error"]["code"] == "AGENT_ERROR"
    assert body["patient_message"]["text"] == "دلم درد می‌کند"
    assert body["agent_message"]["kind"] == "error" and body["agent_message"]["text"] == ERROR_FA
    patient_id = body["patient_message"]["id"]

    detail = lab.req("GET", f"/sessions/{sid}").json()
    assert detail["status"] == "active" and detail["questions_asked"] == 0
    assert [msg["kind"] for msg in detail["messages"]] == ["greeting", "text", "error"]
    calls = _db_rows(m.LLMCall, session_id=sid)
    assert [c.parsed_ok for c in calls] == [False, False]
    assert {c.message_id for c in calls} == {body["agent_message"]["id"]}

    lab.llm.push(ASK)
    r2 = lab.send(sid, "  دلم درد می‌کند ")
    assert r2.status_code == 200
    assert r2.json()["patient_message"]["id"] == patient_id  # reused
    msgs = r2.json()["session"]["messages"]
    assert [msg["kind"] for msg in msgs] == ["greeting", "text", "error", "question"]
    # the error message is excluded from the transcript sent to the model
    roles = [(msg.role, msg.content) for msg in lab.llm.requests[-1].messages[1:]]
    assert roles == [("assistant", GREETING_FA), ("user", "دلم درد می‌کند")]
    assert _db_rows(m.Session, id=sid)[0].turn_in_progress is False


def test_resend_with_different_text_adds_new_message(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(LLMError("HTTP 500"))
    r = lab.send(sid, "اول")
    assert r.status_code == 502
    call = _db_rows(m.LLMCall, session_id=sid)[0]
    assert call.parsed_ok is False and call.error == "HTTP 500" and call.response_text is None
    lab.llm.push(ASK)
    r2 = lab.send(sid, "دوم")
    assert r2.json()["patient_message"]["text"] == "دوم"
    kinds = [(msg["role"], msg["kind"]) for msg in r2.json()["session"]["messages"]]
    assert kinds == [
        ("agent", "greeting"),
        ("patient", "text"),
        ("agent", "error"),
        ("patient", "text"),
        ("agent", "question"),
    ]


def test_finish_error_returns_502_with_null_patient(lab: Lab) -> None:
    sid = lab.create("a-simple")["id"]
    lab.llm.push(ASK, ASK)  # simple force_conclude that keeps asking → AgentOutputError
    r = lab.finish(sid)
    assert r.status_code == 502
    assert r.json()["patient_message"] is None
    assert r.json()["agent_message"]["kind"] == "error"
    assert lab.req("GET", f"/sessions/{sid}").json()["status"] == "active"


def test_message_validation(lab: Lab) -> None:
    sid = lab.create()["id"]
    for bad in ({"text": "   "}, {"text": "x" * 2001}, {}, {"text": 5}):
        r = lab.req("POST", f"/sessions/{sid}/messages", json=bad)
        assert r.status_code == 400, bad
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    lab.llm.push(ASK)
    assert lab.send(sid, "x" * 2000).status_code == 200


def test_unhandled_error_releases_lock(lab: Lab) -> None:
    sid = lab.create()["id"]
    lab.llm.push(RuntimeError("unexpected"))
    r = lab.send(sid, "سلام")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert _db_rows(m.Session, id=sid)[0].turn_in_progress is False


def test_safety_floor_result_text(lab: Lab) -> None:
    sid = lab.create("b-struct")["id"]
    lab.llm.push(
        B_CONCLUDE, fx.js(fx.assessment(triage_level="SELF_CARE", emergency_probability=0.4))
    )
    body = lab.send(sid, "درد قفسه سینه").json()
    card = body["session"]["result"]
    assert card["assessment"]["triage_level"] == "EMERGENCY_NOW"
    assert card["guard"]["raw_triage_level"] == "SELF_CARE"
    assert card["guard"]["actions"] == ["safety_floor_escalation"]
    assert body["session"]["final_triage_level"] == "EMERGENCY_NOW"
    [assessment] = _db_rows(m.Assessment, session_id=sid)
    assert loads(assessment.raw_result_json)["triage_level"] == "SELF_CARE"
    assert loads(assessment.result_json)["triage_level"] == "EMERGENCY_NOW"


def test_structured_conclude_farewell_not_stored_or_shown(lab: Lab) -> None:
    """D-024: the concluding TurnDecision's text is discarded; one turn call, no repair."""
    farewell = "خداحافظ، مراقب خودتان باشید."
    sid = lab.create("b-struct")["id"]
    lab.llm.push(fx.js(fx.turn_decision("conclude", message_to_patient=farewell)), ASSESSMENT)
    r = lab.send(sid, "سردرد دارم")
    assert r.status_code == 200, r.text
    session = r.json()["session"]
    assert session["status"] == "completed"
    assert all(farewell not in msg["text"] for msg in session["messages"])
    (bs,) = session["backstage"]
    assert bs["next_action"] == "conclude" and "message_to_patient" not in bs
    with app_db.session_factory()() as s:
        purposes = [
            c.purpose for c in s.scalars(select(m.LLMCall).where(m.LLMCall.session_id == sid))
        ]
        stored = [b.data_json for b in s.scalars(select(m.TurnBackstage))]
    assert sorted(purposes) == ["assessment", "turn"]
    assert all("message_to_patient" not in d for d in stored)
