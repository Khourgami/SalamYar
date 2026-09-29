from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.agents.registry import Registry, RegistryError, deep_merge, parse_agents
from app.db.models import Agent
from app.db.types import loads

REPO_CONFIG = Path(__file__).parents[1] / "config" / "agents.yaml"

BASE = """
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
{agents}
"""

AGENT = """  - id: {id}
    display_name: "{name}"
    architecture: {arch}
    model: x/{id}
    enabled: {enabled}
{extra}"""


def _yaml(*agents: tuple[str, str, str, bool, str]) -> str:
    body = "".join(
        AGENT.format(id=i, name=n, arch=a, enabled=str(e).lower(), extra=x)
        for i, n, a, e, x in agents
    )
    return BASE.format(agents=body)


def test_repo_config_is_valid_and_matches_table() -> None:
    agents = parse_agents(REPO_CONFIG.read_text(encoding="utf-8"))
    expected = [
        ("b-gemini3flash", "دکتر ۱", "structured", "google/gemini-3-flash", True),
        ("a-sonnet5", "دکتر ۲", "simple", "anthropic/claude-sonnet-5", True),
        ("b-gpt54", "دکتر ۳", "structured", "openai/gpt-5.4", True),
        ("b-deepseekv4pro", "دکتر ۴", "structured", "deepseek/deepseek-v4-pro", True),
        ("a-gpt54", "دکتر ۵", "simple", "openai/gpt-5.4", True),
        ("b-sonnet5", "دکتر ۶", "structured", "anthropic/claude-sonnet-5", True),
        ("b-gpt5mini", "دکتر ۷", "structured", "openai/gpt-5-mini", True),
        ("b-gemini31pro", "دکتر ۸", "structured", "google/gemini-3.1-pro", True),
        ("a-gemini3flash", "دکتر ۹", "simple", "google/gemini-3-flash", False),
        ("a-deepseekv4pro", "دکتر ۱۰", "simple", "deepseek/deepseek-v4-pro", False),
        ("a-gpt5mini", "دکتر ۱۱", "simple", "openai/gpt-5-mini", False),
        ("a-gemini31pro", "دکتر ۱۲", "simple", "google/gemini-3.1-pro", False),
    ]
    got = [(a.id, a.display_name, a.architecture, a.model, a.enabled) for a in agents.values()]
    assert got == expected
    for a in agents.values():
        assert a.description is None
        assert a.temperature == 0.3 and a.reasoning_effort == "low" and a.max_tokens == 4000
        assert a.output_mode == "json_object" and a.prompt_version == "v1"
        assert a.send_temperature is True
        assert a.options.max_questions == 12
        assert a.options.safety_floor is True
        assert a.options.emergency_threshold == 0.20


def test_override_merge() -> None:
    text = _yaml(
        (
            "a-one",
            "D1",
            "simple",
            True,
            "    temperature: null\n    options:\n      max_questions: 3\n",
        ),
        ("b-two", "D2", "structured", True, "    send_temperature: false\n"),
    )
    agents = parse_agents(text)
    one, two = agents["a-one"], agents["b-two"]
    assert one.temperature is None
    assert one.options.max_questions == 3
    assert one.options.safety_floor is True  # nested default kept
    assert one.options.emergency_threshold == 0.20
    assert two.options.max_questions == 12
    assert two.temperature == 0.3 and two.effective_temperature is None
    assert one.effective_temperature is None


def test_deep_merge_does_not_mutate() -> None:
    base = {"a": {"b": 1, "c": 2}}
    merged = deep_merge(base, {"a": {"b": 9}})
    assert merged == {"a": {"b": 9, "c": 2}}
    assert base == {"a": {"b": 1, "c": 2}}


@pytest.mark.parametrize(
    "text,match",
    [
        (_yaml(("a-x", "D", "panel", True, "")), "architecture"),
        (
            _yaml(("a-x", "D1", "simple", True, ""), ("a-x", "D2", "simple", True, "")),
            "duplicate agent id",
        ),
        (
            _yaml(("a-x", "D", "simple", True, ""), ("a-y", "D", "simple", True, "")),
            "duplicate display_name",
        ),
        (_yaml(("a-x", "D", "simple", True, "    colour: red\n")), "colour"),
        (_yaml(("A_X", "D", "simple", True, "")), "slug"),
        (_yaml(("a-x", "D", "simple", True, "    prompt_version: v9\n")), "prompt_version"),
        (
            _yaml(("a-x", "D", "simple", True, "    options:\n      max_questions: 0\n")),
            "max_questions",
        ),
        (_yaml(("a-x", "D", "simple", True, "    output_mode: xml\n")), "output_mode"),
        ("agents: [\n", "invalid YAML"),
        ("defaults: {}\n", "agents"),
        ("- just a list\n", "invalid agents file"),
    ],
)
def test_invalid_files(text: str, match: str) -> None:
    with pytest.raises(RegistryError, match=match):
        parse_agents(text)


def test_registry_load_get_enabled(tmp_path: Path) -> None:
    path = tmp_path / "agents.yaml"
    path.write_text(
        _yaml(("a-x", "D1", "simple", True, ""), ("b-y", "D2", "structured", False, "")),
        encoding="utf-8",
    )
    reg = Registry(path)
    reg.load()
    assert [a.id for a in reg.all()] == ["a-x", "b-y"]
    assert [a.id for a in reg.enabled()] == ["a-x"]
    assert reg.get("b-y") is not None
    assert reg.get("missing") is None


def test_registry_missing_file(tmp_path: Path) -> None:
    with pytest.raises(RegistryError, match="cannot read"):
        Registry(tmp_path / "nope.yaml").load()


def test_reload_keeps_previous_on_error(tmp_path: Path) -> None:
    path = tmp_path / "agents.yaml"
    path.write_text(_yaml(("a-x", "D1", "simple", True, "")), encoding="utf-8")
    reg = Registry(path)
    reg.load()
    path.write_text(_yaml(("a-x", "D1", "bogus", True, "")), encoding="utf-8")
    with pytest.raises(RegistryError):
        reg.reload()
    assert [a.id for a in reg.all()] == ["a-x"]
    path.write_text(
        _yaml(("a-x", "D1", "simple", False, ""), ("a-z", "D3", "simple", True, "")),
        encoding="utf-8",
    )
    reg.reload()
    assert [a.id for a in reg.enabled()] == ["a-z"]


def test_sync_to_db(tmp_path: Path, db: Session) -> None:
    path = tmp_path / "agents.yaml"
    path.write_text(
        _yaml(("a-x", "D1", "simple", True, ""), ("b-y", "D2", "structured", True, "")),
        encoding="utf-8",
    )
    reg = Registry(path)
    reg.load()
    reg.sync_to_db(db)
    rows = {a.id: a for a in db.query(Agent).all()}
    assert set(rows) == {"a-x", "b-y"}
    assert rows["b-y"].architecture == "structured" and rows["b-y"].model == "x/b-y"
    assert loads(rows["a-x"].config_json)["options"]["max_questions"] == 12

    # b-y removed from the file → kept but disabled; a-x renamed
    path.write_text(_yaml(("a-x", "D9", "simple", True, "")), encoding="utf-8")
    reg.reload()
    reg.sync_to_db(db)
    db.expire_all()
    rows = {a.id: a for a in db.query(Agent).all()}
    assert rows["b-y"].enabled is False
    assert rows["a-x"].display_name == "D9"
