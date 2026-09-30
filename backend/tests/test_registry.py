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
pricing:
{pricing}
agents:
{agents}
"""
PRICE = "  x/{id}: {{ input_per_mtok: 1.5, output_per_mtok: 6.0, source: t, as_of: d }}\n"

AGENT = """  - id: {id}
    display_name: "{name}"
    architecture: {arch}
    model: x/{id}
    enabled: {enabled}
{extra}"""


def _yaml(*agents: tuple[str, str, str, bool, str], priced: bool = True) -> str:
    body = "".join(
        AGENT.format(id=i, name=n, arch=a, enabled=str(e).lower(), extra=x)
        for i, n, a, e, x in agents
    )
    prices = "".join(PRICE.format(id=a[0]) for a in agents) if priced else "  {}\n"
    return BASE.format(agents=body, pricing=prices)


REPO_TABLE = [  # BACKEND_ARCHITECTURE §8 (D-022, D-034)
    ("b-gemini3flash", "دکتر ۱", "structured", "google/gemini-3-flash-preview", True),
    ("a-sonnet55", "دکتر ۲", "simple", "anthropic/claude-sonnet-5.5", True),
    ("b-gpt54", "دکتر ۳", "structured", "openai/gpt-5.4", True),
    ("b-deepseekv4pro", "دکتر ۴", "structured", "deepseek/deepseek-v4-pro-0813", True),
    ("a-gpt54", "دکتر ۵", "simple", "openai/gpt-5.4", True),
    ("b-sonnet55", "دکتر ۶", "structured", "anthropic/claude-sonnet-5.5", True),
    ("b-gpt54mini", "دکتر ۷", "structured", "openai/gpt-5.4-mini", True),
    ("b-gemini31pro", "دکتر ۸", "structured", "google/gemini-3.1-pro-preview", True),
    ("a-gemini3flash", "دکتر ۹", "simple", "google/gemini-3-flash-preview", False),
    ("a-deepseekv4pro", "دکتر ۱۰", "simple", "deepseek/deepseek-v4-pro-0813", False),
    ("a-gpt54mini", "دکتر ۱۱", "simple", "openai/gpt-5.4-mini", False),
    ("a-gemini31pro", "دکتر ۱۲", "simple", "google/gemini-3.1-pro-preview", False),
    ("b-gptoss120b", "دکتر ۱۳", "structured", "openai/gpt-oss-120b", True),  # D-036 re-gate 2d
    ("a-gptoss120b", "دکتر ۱۴", "simple", "openai/gpt-oss-120b", False),
]
DEEPSEEK_IDS = {"b-deepseekv4pro", "a-deepseekv4pro"}
RETIRED_IDS = ("b-sonnet5", "a-sonnet5", "b-gpt5mini", "a-gpt5mini")  # D-034


def test_repo_config_is_valid_and_matches_table() -> None:
    agents = parse_agents(REPO_CONFIG.read_text(encoding="utf-8"))
    got = [(a.id, a.display_name, a.architecture, a.model, a.enabled) for a in agents.values()]
    assert got == REPO_TABLE
    assert len(agents) == 14
    # 9 per D-034; b-gptoss120b gated off in 2b-2 and re-enabled in 2d with a pinned provider
    assert sum(a.enabled for a in agents.values()) == 9
    assert len({a.display_name for a in agents.values()}) == 14
    # D-041 pins (B-053, B-054): only the open-weight models carry a provider order
    orders = {a.model: a.provider_order for a in agents.values()}
    assert orders["openai/gpt-oss-120b"] == ["cerebras/fp16"]
    assert orders["deepseek/deepseek-v4-pro-0813"] == ["coreweave/fp8"]
    assert {m for m, o in orders.items() if o} == {
        "openai/gpt-oss-120b",
        "deepseek/deepseek-v4-pro-0813",
    }
    for a in agents.values():
        assert a.description is None
        assert a.temperature == 0.3
        if a.id in DEEPSEEK_IDS:  # D-036
            assert a.reasoning_effort == "minimal" and a.max_tokens == 8000
        else:
            assert a.reasoning_effort == "low" and a.max_tokens == 4000
        assert a.output_mode == "json_object" and a.prompt_version == "v1"
        assert a.send_temperature is True
        assert a.options.max_questions == 12
        assert a.options.safety_floor is True
        assert a.options.emergency_threshold == 0.20


def test_repo_config_retires_old_ids_on_sync(db: Session) -> None:
    for old in RETIRED_IDS:  # rows as left by the previous model set
        db.add(
            Agent(
                id=old,
                display_name=f"old {old}",
                architecture="simple",
                model="x/old",
                config_json="{}",
                enabled=True,
            )
        )
    db.commit()
    reg = Registry(REPO_CONFIG)
    reg.load()
    reg.sync_to_db(db)
    rows = {a.id: a for a in db.query(Agent).all()}
    assert len(rows) == 18
    for old in RETIRED_IDS:
        assert rows[old].enabled is False
    assert {i for i, r in rows.items() if r.enabled} == {row[0] for row in REPO_TABLE if row[4]}


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


# --- pricing (D-035) ----------------------------------------------------------------------


def test_repo_config_prices_every_model() -> None:
    agents = parse_agents(REPO_CONFIG.read_text(encoding="utf-8"))
    models = {a.model for a in agents.values()}
    assert len(models) == 7
    for a in agents.values():
        assert a.pricing is not None
        assert a.pricing.input_per_mtok > 0 and a.pricing.output_per_mtok > 0
        assert a.pricing.source == "openrouter-models" and a.pricing.as_of == "2026-09-30"
    # D-042: cache-read prices for every model that lists one on /models (B-050)
    cache = {a.model: a.pricing.input_cache_read_per_mtok for a in agents.values() if a.pricing}
    assert cache == {
        "openai/gpt-5.4": 0.25,
        "anthropic/claude-sonnet-5.5": 0.2,
        "google/gemini-3.1-pro-preview": 0.2,
        "openai/gpt-5.4-mini": 0.075,
        "google/gemini-3-flash-preview": 0.05,
        "deepseek/deepseek-v4-pro-0813": 0.044,
        "openai/gpt-oss-120b": None,
    }


def test_pricing_attached_to_agent() -> None:
    agents = parse_agents(_yaml(("a-x", "D1", "simple", True, "")))
    price = agents["a-x"].pricing
    assert price is not None
    assert (price.input_per_mtok, price.output_per_mtok) == (1.5, 6.0)
    assert agents["a-x"].model_dump(mode="json")["pricing"] == {
        "input_per_mtok": 1.5,
        "output_per_mtok": 6.0,
        "input_cache_read_per_mtok": None,
        "source": "t",
        "as_of": "d",
    }


def test_missing_price_names_the_model() -> None:
    # the disabled agent's model is missing too: every referenced model needs a price
    text = _yaml(("a-x", "D1", "simple", True, "")) + (
        '  - id: b-off\n    display_name: "D2"\n    architecture: structured\n'
        "    model: x/unpriced\n    enabled: false\n"
    )
    with pytest.raises(RegistryError, match="no pricing entry for model 'x/unpriced'"):
        parse_agents(text)
    with pytest.raises(RegistryError, match="x/a-x"):
        parse_agents(_yaml(("a-x", "D1", "simple", True, ""), priced=False))


@pytest.mark.parametrize(
    "entry,match",
    [
        ('{ input_per_mtok: -1, output_per_mtok: 1, source: s, as_of: "d" }', "input_per_mtok"),
        ('{ input_per_mtok: 1, output_per_mtok: -0.1, source: s, as_of: "d" }', "output_per_mtok"),
        ('{ input_per_mtok: 1, output_per_mtok: 1, source: s, as_of: "d", cache: 1 }', "cache"),
        ("{ input_per_mtok: 1, output_per_mtok: 1, source: s }", "as_of"),
    ],
)
def test_invalid_price(entry: str, match: str) -> None:
    text = _yaml(("a-x", "D1", "simple", True, ""), priced=False).replace(
        "pricing:\n  {}\n", f"pricing:\n  x/a-x: {entry}\n"
    )
    with pytest.raises(RegistryError, match=match):
        parse_agents(text)


def test_pricing_not_allowed_per_agent_or_in_defaults() -> None:
    per_agent = _yaml(("a-x", "D1", "simple", True, "    pricing: {}\n"))
    with pytest.raises(RegistryError, match="top-level"):
        parse_agents(per_agent)
    in_defaults = _yaml(("a-x", "D1", "simple", True, "")).replace(
        "defaults:\n", "defaults:\n  pricing: {}\n"
    )
    with pytest.raises(RegistryError, match="top-level"):
        parse_agents(in_defaults)


def test_estimate_formula() -> None:
    from app.agents.config import ModelPricing

    price = ModelPricing(input_per_mtok=1.25, output_per_mtok=10.0, source="s", as_of="d")
    assert price.estimate(3722, 852) == pytest.approx((3722 * 1.25 + 852 * 10.0) / 1e6)
    assert price.estimate(None, 10) is None and price.estimate(10, None) is None
    assert price.estimate(0, 0) == 0.0


def test_estimate_with_cached_tokens() -> None:
    """D-042: (prompt − cached) × input + cached × cache_read + completion × output, per 1e6."""
    from app.agents.config import ModelPricing

    cached_price = ModelPricing(
        input_per_mtok=2.5,
        output_per_mtok=15.0,
        input_cache_read_per_mtok=0.25,
        source="s",
        as_of="d",
    )
    plain = ModelPricing(input_per_mtok=2.5, output_per_mtok=15.0, source="s", as_of="d")
    # 3268 prompt (2816 cached), 824 completion: 452 × 2.5 + 2816 × 0.25 + 824 × 15 = 14194
    assert cached_price.estimate(3268, 824, 2816) == pytest.approx(0.014194)
    # without cached tokens (None or 0) the formula is unchanged: 3268 × 2.5 + 824 × 15 = 20530
    assert cached_price.estimate(3268, 824) == pytest.approx(0.02053)
    assert cached_price.estimate(3268, 824, 0) == pytest.approx(0.02053)
    # without a cache price the cached tokens are billed at the input price
    assert plain.estimate(3268, 824, 2816) == pytest.approx(0.02053)
    # cached tokens never exceed the prompt tokens
    assert cached_price.estimate(100, 0, 500) == pytest.approx(100 * 0.25 / 1e6)
    assert cached_price.estimate(None, 824, 2816) is None


def test_cache_read_price_optional_and_non_negative() -> None:
    ok = _yaml(("a-x", "D1", "simple", True, ""), priced=False).replace(
        "pricing:\n  {}\n",
        "pricing:\n  x/a-x: { input_per_mtok: 2, output_per_mtok: 8, "
        "input_cache_read_per_mtok: 0.2, source: s, as_of: d }\n",
    )
    price = parse_agents(ok)["a-x"].pricing
    assert price is not None and price.input_cache_read_per_mtok == 0.2
    with pytest.raises(RegistryError, match="input_cache_read_per_mtok"):
        parse_agents(ok.replace("input_cache_read_per_mtok: 0.2", "input_cache_read_per_mtok: -1"))


OSS = "openai/gpt-oss-120b"


def _oss_yaml(order_block: str, model: str = OSS, extra: str = "") -> str:
    return (
        "pricing:\n"
        f"  {model}: {{ input_per_mtok: 0.037, output_per_mtok: 0.17, source: s, as_of: d }}\n"
        f"{order_block}"
        "agents:\n"
        f'  - id: b-oss\n    display_name: "D1"\n    architecture: structured\n'
        f"    model: {model}\n{extra}"
    )


def test_provider_order_attached_for_open_weight_model() -> None:
    agents = parse_agents(_oss_yaml(f"provider_order:\n  {OSS}: [cerebras/fp16, crusoe]\n"))
    cfg = agents["b-oss"]
    assert cfg.provider_order == ["cerebras/fp16", "crusoe"]
    # part of the session snapshot (B-015)
    assert cfg.model_dump(mode="json")["provider_order"] == ["cerebras/fp16", "crusoe"]
    unpinned = parse_agents(_oss_yaml(""))["b-oss"]
    assert unpinned.provider_order is None
    assert unpinned.model_dump(mode="json")["provider_order"] is None


def test_provider_order_rejected_for_other_models() -> None:
    text = _oss_yaml("provider_order:\n  openai/gpt-5.4: [openai]\n", model="openai/gpt-5.4")
    with pytest.raises(RegistryError, match="provider_order is only allowed.*openai/gpt-5.4"):
        parse_agents(text)
    with pytest.raises(RegistryError, match="at least one provider"):
        parse_agents(_oss_yaml(f"provider_order:\n  {OSS}: []\n"))
    with pytest.raises(RegistryError, match="invalid agents file"):
        parse_agents(_oss_yaml(f'provider_order:\n  {OSS}: [""]\n'))


def test_provider_order_not_allowed_per_agent_or_in_defaults() -> None:
    with pytest.raises(RegistryError, match="'provider_order' belongs in the top-level map"):
        parse_agents(_oss_yaml("", extra="    provider_order: [crusoe]\n"))
    in_defaults = "defaults:\n  provider_order: [crusoe]\n" + _oss_yaml("")
    with pytest.raises(RegistryError, match="'provider_order' is a top-level map"):
        parse_agents(in_defaults)


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
