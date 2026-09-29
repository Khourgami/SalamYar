import pytest

from app.api.deps import get_llm
from app.llm.demo import DemoLLM
from app.main import app
from tests.lab import Lab


@pytest.mark.parametrize("agent,questions", [("a-simple", 2), ("b-struct", 1)])
def test_demo_llm_drives_full_session(lab: Lab, agent: str, questions: int) -> None:
    demo = DemoLLM()
    app.dependency_overrides[get_llm] = lambda: demo
    sid = lab.create(agent)["id"]
    kinds = []
    for text in ("سردرد دارم", "۵ از ۱۰", "نه"):
        r = lab.send(sid, text)
        assert r.status_code == 200, r.text
        kinds.append(r.json()["agent_message"]["kind"])
        if kinds[-1] == "result":
            break
    s = r.json()["session"]
    assert kinds[-1] == "result" and kinds.count("question") == questions
    assert s["end_reason"] == "agent_concluded"


def test_demo_llm_finish(lab: Lab) -> None:
    demo = DemoLLM()
    app.dependency_overrides[get_llm] = lambda: demo
    for agent in ("a-simple", "b-struct"):
        sid = lab.create(agent)["id"]
        r = lab.finish(sid)
        assert r.status_code == 200, r.text
        assert r.json()["session"]["end_reason"] == "evaluator_ended"
