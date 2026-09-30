import pytest

from app.api.deps import get_llm
from app.llm.client import LLMMessage, LLMRequest
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


async def test_demo_llm_usage_is_deterministic() -> None:
    demo = DemoLLM()
    req = LLMRequest(
        model="x/y",
        messages=[LLMMessage(role="system", content="s"), LLMMessage(role="user", content="u")],
    )
    first, second = await demo.complete(req), await demo.complete(req)
    for resp in (first, second):
        assert (resp.prompt_tokens, resp.completion_tokens, resp.reasoning_tokens) == (
            1500,
            300,
            60,
        )
        assert resp.cost_usd == 0.002


def test_demo_llm_usage_reaches_session_totals(lab: Lab) -> None:
    demo = DemoLLM()
    app.dependency_overrides[get_llm] = lambda: demo
    lab.user("boss", "admin")
    sid = lab.create("b-struct")["id"]
    lab.send(sid, "سردرد دارم")
    assert lab.send(sid, "۵ از ۱۰").json()["session"]["status"] == "completed"
    stats = lab.req("GET", f"/admin/sessions/{sid}", "boss").json()["result"]["stats"]
    assert stats["llm_calls"] == 3  # turn, turn, assessment
    assert (stats["prompt_tokens"], stats["completion_tokens"]) == (4500, 900)
    assert stats["reasoning_tokens"] == 180
    assert stats["total_cost_usd"] == pytest.approx(0.006)
