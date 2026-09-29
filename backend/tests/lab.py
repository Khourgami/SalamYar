"""API-level test harness: temp registry + FakeLLM + users + request helpers."""

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.agents.registry import Registry, set_registry
from app.api.deps import get_llm
from app.db.models import User
from app.llm.fake import FakeLLM
from app.main import app
from tests import fixtures as fx
from tests.helpers import auth_headers, make_user

TEST_AGENTS = """
defaults:
  temperature: 0.3
  reasoning_effort: low
  max_tokens: 4000
  output_mode: json_object
  prompt_version: v1
  options:
    max_questions: 12
    safety_floor: true
    emergency_threshold: 0.20
agents:
  - id: a-simple
    display_name: "دکتر ۱"
    architecture: simple
    model: test/simple-model
  - id: b-struct
    display_name: "دکتر ۲"
    architecture: structured
    model: test/struct-model
  - id: a-capped
    display_name: "دکتر ۳"
    architecture: simple
    model: test/capped
    options:
      max_questions: 2
  - id: b-capped
    display_name: "دکتر ۴"
    architecture: structured
    model: test/b-capped
    options:
      max_questions: 2
  - id: a-off
    display_name: "دکتر ۵"
    architecture: simple
    model: test/off
    enabled: false
"""

ASK = fx.js(fx.simple_turn("ask"))
CONCLUDE = fx.js(fx.simple_turn("conclude"))
B_ASK = fx.js(fx.turn_decision("ask"))
B_CONCLUDE = fx.js(fx.turn_decision("conclude"))
ASSESSMENT = fx.js(fx.assessment())


class Lab:
    def __init__(self, client: TestClient, tmp_path: Path) -> None:
        path = tmp_path / "agents.yaml"
        path.write_text(TEST_AGENTS, encoding="utf-8")
        self.registry = Registry(path)
        self.registry.load()
        set_registry(self.registry)
        self.llm = FakeLLM()
        app.dependency_overrides[get_llm] = lambda: self.llm
        self.client = client
        self.users: dict[str, User] = {}
        self.sync()

    def sync(self) -> None:
        from app import db as app_db

        with app_db.session_factory()() as s:
            self.registry.sync_to_db(s)

    def user(self, name: str = "ev1", role: str = "evaluator") -> User:
        if name not in self.users:
            self.users[name] = make_user(name, role)
        return self.users[name]

    def h(self, name: str = "ev1") -> dict[str, str]:
        return auth_headers(self.users[name] if name in self.users else self.user(name))

    def req(self, method: str, url: str, who: str = "ev1", **kw: Any) -> Any:
        return self.client.request(method, f"/api/v1{url}", headers=self.h(who), **kw)

    def create(self, agent_id: str = "a-simple", who: str = "ev1") -> dict[str, Any]:
        r = self.req("POST", "/sessions", who, json={"agent_id": agent_id})
        assert r.status_code == 201, r.text
        return r.json()

    def send(self, sid: str, text: str, who: str = "ev1") -> Any:
        return self.req("POST", f"/sessions/{sid}/messages", who, json={"text": text})

    def finish(self, sid: str, who: str = "ev1") -> Any:
        return self.req("POST", f"/sessions/{sid}/finish", who, json={})

    def completed_session(
        self, agent_id: str = "a-simple", who: str = "ev1", **assessment: Any
    ) -> str:
        sid = self.create(agent_id, who)["id"]
        if agent_id.startswith("a-"):
            self.llm.push(
                ASK, fx.js(fx.simple_turn("conclude", assessment=fx.assessment(**assessment)))
            )
        else:
            self.llm.push(B_ASK, B_CONCLUDE, fx.js(fx.assessment(**assessment)))
        assert self.send(sid, "سردرد دارم", who).status_code == 200
        r = self.send(sid, "از دیروز", who)
        assert r.status_code == 200, r.text
        assert r.json()["session"]["status"] == "completed"
        return sid
