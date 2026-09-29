import copy

import pytest

from tests import fixtures as fx
from tests.lab import ASK, Lab


def _agent_messages(lab: Lab, sid: str, who: str = "ev1") -> dict[str, str]:
    msgs = lab.req("GET", f"/sessions/{sid}", who).json()["messages"]
    return {msg["kind"]: msg["id"] for msg in msgs}


def _evaluate(lab: Lab, sid: str, who: str = "ev1", **kw: object):  # type: ignore[no-untyped-def]
    return lab.req("POST", f"/sessions/{sid}/evaluation", who, json=fx.evaluation(**kw))


# --- feedback ------------------------------------------------------------------------------


def test_feedback_upsert_and_delete(lab: Lab) -> None:
    sid = lab.completed_session()
    qid = _agent_messages(lab, sid)["question"]
    r = lab.req("PUT", f"/messages/{qid}/feedback", json={"rating": "up", "note": None})
    assert r.status_code == 200
    first = r.json()
    assert first["message_id"] == qid and first["rating"] == "up" and first["note"] is None

    r = lab.req("PUT", f"/messages/{qid}/feedback", json={"rating": "down", "note": "سوال مبهم"})
    assert r.status_code == 200 and r.json()["rating"] == "down"
    detail = lab.req("GET", f"/sessions/{sid}").json()
    assert [(f["message_id"], f["rating"], f["note"]) for f in detail["feedback"]] == [
        (qid, "down", "سوال مبهم")
    ]

    assert lab.req("DELETE", f"/messages/{qid}/feedback").status_code == 204
    assert lab.req("GET", f"/sessions/{sid}").json()["feedback"] == []
    assert lab.req("DELETE", f"/messages/{qid}/feedback").status_code == 204  # idempotent


def test_feedback_on_active_session_result_kind(lab: Lab) -> None:
    sid = lab.create()["id"]
    lab.llm.push(ASK)
    q = lab.send(sid, "سلام").json()["agent_message"]["id"]
    assert lab.req("PUT", f"/messages/{q}/feedback", json={"rating": "up"}).status_code == 200
    rid = _agent_messages(lab, lab.completed_session())["result"]
    assert lab.req("PUT", f"/messages/{rid}/feedback", json={"rating": "up"}).status_code == 200


def test_feedback_wrong_message_kind(lab: Lab) -> None:
    sid = lab.completed_session()
    ids = _agent_messages(lab, sid)
    for kind in ("greeting", "text"):
        r = lab.req("PUT", f"/messages/{ids[kind]}/feedback", json={"rating": "up"})
        assert r.status_code == 400, kind
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_feedback_error_message_kind(lab: Lab) -> None:
    sid = lab.create()["id"]
    lab.llm.push("bad", "bad")
    err = lab.send(sid, "سلام").json()["agent_message"]["id"]
    assert lab.req("PUT", f"/messages/{err}/feedback", json={"rating": "up"}).status_code == 400


def test_feedback_access_and_validation(lab: Lab) -> None:
    sid = lab.completed_session()
    qid = _agent_messages(lab, sid)["question"]
    lab.user("ev2")
    lab.user("boss", "admin")
    assert (
        lab.req("PUT", f"/messages/{qid}/feedback", "ev2", json={"rating": "up"}).status_code == 403
    )
    assert lab.req("DELETE", f"/messages/{qid}/feedback", "ev2").status_code == 403
    assert (
        lab.req("PUT", f"/messages/{qid}/feedback", "boss", json={"rating": "up"}).status_code
        == 403
    )
    assert lab.req("PUT", "/messages/nope/feedback", json={"rating": "up"}).status_code == 404
    for bad in ({"rating": "meh"}, {"rating": "up", "note": "x" * 1001}, {}):
        assert lab.req("PUT", f"/messages/{qid}/feedback", json=bad).status_code == 400


def test_feedback_locked_after_evaluation(lab: Lab) -> None:
    sid = lab.completed_session()
    qid = _agent_messages(lab, sid)["question"]
    lab.req("PUT", f"/messages/{qid}/feedback", json={"rating": "up"})
    assert _evaluate(lab, sid).status_code == 201
    for method, kw in (("PUT", {"json": {"rating": "down"}}), ("DELETE", {})):
        r = lab.req(method, f"/messages/{qid}/feedback", **kw)
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "EVALUATION_LOCKED"
    assert lab.req("GET", f"/sessions/{sid}").json()["feedback"][0]["rating"] == "up"


# --- evaluation ----------------------------------------------------------------------------


def test_evaluation_and_reveal(lab: Lab) -> None:
    sid = lab.completed_session("b-struct")
    before = lab.req("GET", f"/sessions/{sid}").json()
    assert (
        before["reveal"] is None and before["evaluation"] is None and before["evaluated"] is False
    )

    r = _evaluate(lab, sid)
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["session_id"] == sid and ev["id"] and ev["created_at"]
    assert ev["scores"]["overall_trust"] == 4
    assert ev["doctor_verdict"]["main_diagnosis"] == "میگرن"

    after = lab.req("GET", f"/sessions/{sid}").json()
    assert after["evaluated"] is True
    assert after["evaluation"] == ev
    assert after["reveal"] == {
        "architecture": "structured",
        "model": "test/struct-model",
        "config": {
            "max_questions": 12,
            "safety_floor": True,
            "emergency_threshold": 0.2,
            "reasoning_effort": "low",
            "temperature": 0.3,
            "prompt_version": "v1",
        },
    }


def test_evaluation_requires_completed(lab: Lab) -> None:
    sid = lab.create()["id"]
    r = _evaluate(lab, sid)
    assert r.status_code == 409 and r.json()["error"]["code"] == "SESSION_NOT_COMPLETED"


def test_evaluation_only_once(lab: Lab) -> None:
    sid = lab.completed_session()
    assert _evaluate(lab, sid).status_code == 201
    r = _evaluate(lab, sid)
    assert r.status_code == 409
    assert r.json() == {
        "error": {"code": "EVALUATION_LOCKED", "message": "Session already evaluated"}
    }


def test_evaluation_owner_only(lab: Lab) -> None:
    sid = lab.completed_session()
    lab.user("ev2")
    assert _evaluate(lab, sid, "ev2").status_code == 403
    assert lab.req("POST", "/sessions/nope/evaluation", json=fx.evaluation()).status_code == 404


def _without(path: list[str]) -> dict:
    data = copy.deepcopy(fx.evaluation())
    node = data
    for key in path[:-1]:
        node = node[key]
    del node[path[-1]]
    return data


@pytest.mark.parametrize(
    "body",
    [
        _without(["scores", "efficiency"]),
        _without(["safety_flags", "definitive_diagnosis_claim"]),
        _without(["doctor_verdict", "triage_level"]),
        _without(["comparison"]),
        fx.evaluation(scores={**fx.evaluation()["scores"], "communication": 0}),
        fx.evaluation(scores={**fx.evaluation()["scores"], "communication": 6}),
        fx.evaluation(scores={**fx.evaluation()["scores"], "communication": 3.5}),
        fx.evaluation(scores={**fx.evaluation()["scores"], "communication": "3"}),
        fx.evaluation(unnecessary_questions_count=51),
        fx.evaluation(unnecessary_questions_count=-1),
        fx.evaluation(
            doctor_verdict={"triage_level": "SOON", "specialty": "ent", "main_diagnosis": None}
        ),
        fx.evaluation(
            doctor_verdict={"triage_level": "SELF_CARE", "specialty": "x", "main_diagnosis": None}
        ),
        fx.evaluation(
            safety_flags={**fx.evaluation()["safety_flags"], "dangerous_undertriage": "no"}
        ),
        fx.evaluation(comparison={"compared_session_id": "x", "winner": "both"}),
        fx.evaluation(extra_field=1),
    ],
)
def test_evaluation_validation(lab: Lab, body: dict) -> None:
    sid = lab.completed_session()
    r = lab.req("POST", f"/sessions/{sid}/evaluation", json=body)
    assert r.status_code == 400, body
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_evaluation_accepts_boundaries_and_nulls(lab: Lab) -> None:
    sid = lab.completed_session()
    scores = {k: 1 for k in fx.evaluation()["scores"]} | {"overall_trust": 5}
    r = _evaluate(lab, sid, scores=scores, unnecessary_questions_count=None)
    assert r.status_code == 201
    assert r.json()["unnecessary_questions_count"] is None


def test_comparison_validation(lab: Lab) -> None:
    this = lab.completed_session()
    active = lab.create()["id"]
    others = lab.completed_session(who="ev2")

    def cmp(target: str) -> int:
        body = {"comparison": {"compared_session_id": target, "winner": "this"}}
        return _evaluate(lab, this, **body).status_code

    assert cmp(this) == 400  # same session
    assert cmp(active) == 400  # not completed
    assert cmp(others) == 400  # another user's session
    assert cmp("missing") == 400
    good = lab.completed_session()
    assert cmp(good) == 201
    ev = lab.req("GET", f"/sessions/{this}").json()["evaluation"]
    assert ev["comparison"] == {"compared_session_id": good, "winner": "this"}
