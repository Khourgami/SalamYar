"""Owner-only session endpoints for every role, admins included (D-020, contract v1.1 §5–§7)."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest

from app import db as app_db
from app.db import models as m
from tests import fixtures as fx
from tests.lab import ASK, CONCLUDE, Lab


def _question_id(lab: Lab, sid: str) -> str:
    msgs = lab.req("GET", f"/sessions/{sid}").json()["messages"]
    return next(x["id"] for x in msgs if x["kind"] == "question")


# Each case: (prepare(lab) -> (method, url, json, llm_script), expected owner status).
Case = Callable[[Lab], tuple[str, str, dict[str, Any] | None, list[str]]]


def _get(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    return "GET", f"/sessions/{lab.create()['id']}", None, []


def _message(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    return "POST", f"/sessions/{lab.create()['id']}/messages", {"text": "سردرد دارم"}, [ASK]


def _finish(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    return "POST", f"/sessions/{lab.create()['id']}/finish", {}, [CONCLUDE]


def _put_feedback(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    qid = _question_id(lab, lab.completed_session())
    return "PUT", f"/messages/{qid}/feedback", {"rating": "up", "note": None}, []


def _delete_feedback(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    qid = _question_id(lab, lab.completed_session())
    return "DELETE", f"/messages/{qid}/feedback", None, []


def _evaluation(lab: Lab) -> tuple[str, str, dict[str, Any] | None, list[str]]:
    return "POST", f"/sessions/{lab.completed_session()}/evaluation", fx.evaluation(), []


CASES: dict[str, tuple[Case, int]] = {
    "get_session": (_get, 200),
    "post_message": (_message, 200),
    "finish": (_finish, 200),
    "put_feedback": (_put_feedback, 200),
    "delete_feedback": (_delete_feedback, 204),
    "evaluation": (_evaluation, 201),
}

UNKNOWN: dict[str, tuple[str, str, dict[str, Any] | None]] = {
    "get_session": ("GET", "/sessions/nope", None),
    "post_message": ("POST", "/sessions/nope/messages", {"text": "سلام"}),
    "finish": ("POST", "/sessions/nope/finish", {}),
    "put_feedback": ("PUT", "/messages/nope/feedback", {"rating": "up", "note": None}),
    "delete_feedback": ("DELETE", "/messages/nope/feedback", None),
    "evaluation": ("POST", "/sessions/nope/evaluation", fx.evaluation()),
}


@pytest.mark.parametrize("endpoint", list(CASES))
@pytest.mark.parametrize("caller", ["owner", "other_evaluator", "admin_not_owner"])
def test_owner_only_matrix(lab: Lab, endpoint: str, caller: str) -> None:
    lab.user("ev1")
    lab.user("ev2")
    lab.user("boss", "admin")
    prepare, owner_status = CASES[endpoint]
    method, url, body, script = prepare(lab)
    lab.llm.push(*script)
    who = {"owner": "ev1", "other_evaluator": "ev2", "admin_not_owner": "boss"}[caller]
    r = lab.req(method, url, who, json=body) if body is not None else lab.req(method, url, who)
    if caller == "owner":
        assert r.status_code == owner_status, r.text
        assert not lab.llm.responses  # the scripted LLM output was consumed
    else:
        assert r.status_code == 403, r.text
        assert r.json() == {"error": {"code": "FORBIDDEN", "message": r.json()["error"]["message"]}}
        assert len(lab.llm.responses) == len(script)  # rejected before any LLM call


@pytest.mark.parametrize("endpoint", list(UNKNOWN))
@pytest.mark.parametrize("who", ["ev1", "boss"])
def test_unknown_id_is_404_before_ownership(lab: Lab, endpoint: str, who: str) -> None:
    lab.user("boss", "admin")
    method, url, body = UNKNOWN[endpoint]
    r = lab.req(method, url, who, json=body) if body is not None else lab.req(method, url, who)
    assert r.status_code == 404, r.text
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_admin_reads_other_session_through_admin_endpoint(lab: Lab) -> None:
    sid = lab.completed_session()
    lab.user("boss", "admin")
    assert lab.req("GET", f"/sessions/{sid}", "boss").status_code == 403
    r = lab.req("GET", f"/admin/sessions/{sid}", "boss")
    assert r.status_code == 200
    assert r.json()["reveal"]["architecture"] == "simple"
    assert r.json()["result"] is not None


def test_session_list_is_own_sessions_for_admin_too(lab: Lab) -> None:
    lab.create(who="ev1")
    lab.user("boss", "admin")
    own = lab.create(who="boss")["id"]
    body = lab.req("GET", "/sessions", "boss").json()
    assert body["total"] == 1 and [s["id"] for s in body["items"]] == [own]


def test_lists_are_newest_first(lab: Lab) -> None:
    lab.user("boss", "admin")
    ids = [lab.create()["id"] for _ in range(3)]
    own = [s["id"] for s in lab.req("GET", "/sessions").json()["items"]]
    assert own == ids[::-1]
    admin = [s["id"] for s in lab.req("GET", "/admin/sessions", "boss").json()["items"]]
    assert admin == ids[::-1]


def test_equal_created_at_falls_back_to_id_desc(lab: Lab) -> None:
    lab.user("boss", "admin")
    ids = [lab.create()["id"] for _ in range(3)]
    same = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
    with app_db.session_factory()() as s:
        for sid in ids:
            s.get(m.Session, sid).created_at = same  # type: ignore[union-attr]
        s.commit()
    expected = sorted(ids, reverse=True)
    assert [x["id"] for x in lab.req("GET", "/sessions").json()["items"]] == expected
    admin = lab.req("GET", "/admin/sessions", "boss").json()["items"]
    assert [x["id"] for x in admin] == expected
