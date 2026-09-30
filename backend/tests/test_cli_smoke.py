import json
from pathlib import Path

import httpx
import pytest

from app import cli
from app.agents.config import AgentConfig
from app.llm.client import LLMError, LLMResponse
from app.llm.fake import FakeLLM
from app.smoke import (
    JSON_TEXT_LIMIT,
    PATIENT_MESSAGES,
    SmokeResult,
    exit_code,
    fetch_model_ids,
    format_table,
    result_to_dict,
    run_agent,
    smoke_test,
    write_json,
)
from tests.lab import ASK, ASSESSMENT, B_ASK, B_CONCLUDE, CONCLUDE, TEST_AGENTS


def _cfg(arch: str, agent_id: str | None = None, model: str = "m/x") -> AgentConfig:
    return AgentConfig.model_validate(
        {
            "id": agent_id or f"{arch[0]}-t",
            "display_name": agent_id or "D",
            "architecture": arch,
            "model": model,
        }
    )


# --- run_agent -----------------------------------------------------------------------------


async def test_run_agent_simple_full_script() -> None:
    llm = FakeLLM([ASK, ASK, CONCLUDE])
    res = await run_agent(_cfg("simple"), llm)
    assert (res.turn1, res.turn2, res.conclude) == ("y", "y", "y")
    assert res.ok and res.error == "" and res.repairs == 0
    assert res.cost_usd == pytest.approx(0.003)
    # the scripted patient messages were sent, then the forced conclusion
    contents = [m.content for m in llm.requests[2].messages]
    assert PATIENT_MESSAGES[0] in contents and PATIENT_MESSAGES[1] in contents
    assert contents[-1] == 'Conclude now. Set action to "conclude".'


async def test_run_agent_structured_carries_hypotheses() -> None:
    llm = FakeLLM([B_ASK, B_ASK, ASSESSMENT])
    res = await run_agent(_cfg("structured"), llm)
    assert res.ok
    payload2 = json.loads(llm.requests[1].messages[1].content)
    assert payload2["previous_hypotheses"][0]["name_en"] == "Migraine"
    assert payload2["questions_asked"] == 1
    assert json.loads(llm.requests[2].messages[1].content)["end_reason"] == "evaluator_ended"


async def test_run_agent_early_result() -> None:
    llm = FakeLLM([CONCLUDE])
    res = await run_agent(_cfg("simple"), llm)
    assert (res.turn1, res.turn2, res.conclude) == ("y", "-", "y")
    assert res.ok and len(llm.requests) == 1


async def test_run_agent_repair_counted() -> None:
    res = await run_agent(_cfg("simple"), FakeLLM(["oops", ASK, ASK, CONCLUDE]))
    assert res.repairs == 1 and res.ok


async def test_run_agent_failure_on_turn2() -> None:
    res = await run_agent(_cfg("simple"), FakeLLM([ASK, "bad", "bad"]))
    assert (res.turn1, res.turn2, res.conclude) == ("y", "n", "-")
    assert res.error.startswith("AgentOutputError")
    assert not res.ok


async def test_run_agent_failure_on_conclude() -> None:
    res = await run_agent(_cfg("simple"), FakeLLM([ASK, ASK, LLMError("HTTP 500")]))
    assert (res.turn1, res.turn2, res.conclude) == ("y", "y", "n")
    assert res.error == "LLMError: HTTP 500"
    assert exit_code([res]) == 1


async def test_smoke_test_skips_missing_models() -> None:
    llm = FakeLLM([ASK, ASK, CONCLUDE])
    results = await smoke_test(
        [_cfg("simple", "a-ok", "real/model"), _cfg("simple", "a-bad", "wrong/slug")],
        llm,
        {"real/model"},
    )
    assert [r.model_found for r in results] == [True, False]
    assert results[1].error == "model not found" and results[1].turn1 == "-"
    assert len(llm.requests) == 3  # nothing sent for the missing model
    assert exit_code(results) == 1
    assert exit_code(results[:1]) == 0
    assert exit_code([]) == 1


class StepClock:
    """Fake clock: every read advances by the next scripted delta (seconds)."""

    def __init__(self, *deltas: float) -> None:
        self.now = 0.0
        self.deltas = list(deltas)

    def __call__(self) -> float:
        self.now += self.deltas.pop(0) if self.deltas else 0.0
        return self.now


async def test_run_agent_per_turn_latencies() -> None:
    # reads: start, t1 start, t1 end, t2 start, t2 end, conclude start, conclude end, total
    clock = StepClock(0, 0, 2.0, 0, 3.5, 0, 9.25, 0)
    res = await run_agent(_cfg("simple"), FakeLLM([ASK, ASK, CONCLUDE]), clock=clock)
    assert res.turn_latencies_ms == {"turn1": 2000, "turn2": 3500, "conclude": 9250}
    assert res.mean_turn_ms == pytest.approx(4916.67, abs=0.01)
    assert res.max_turn_ms == 9250
    assert res.latency_ms == 14750
    assert res.result_step == "conclude" and res.llm_calls == 3
    assert set(res.replies) == {"turn1", "turn2", "conclude"}


async def test_run_agent_failed_step_latency_recorded() -> None:
    clock = StepClock(0, 0, 1.0, 0, 4.0, 0)
    res = await run_agent(_cfg("simple"), FakeLLM([ASK, "bad", "bad"]), clock=clock)
    assert res.turn_latencies_ms == {"turn1": 1000, "turn2": 4000}
    assert "turn2" not in res.replies and res.result_step is None


async def test_run_agent_early_result_has_no_conclude_latency() -> None:
    res = await run_agent(_cfg("simple"), FakeLLM([CONCLUDE]))
    assert list(res.turn_latencies_ms) == ["turn1"]
    assert res.result_step == "turn1" and res.triage_level is not None


async def test_structured_conclusion_turn_calls_tagged() -> None:
    llm = FakeLLM([B_ASK, B_CONCLUDE, ASSESSMENT])
    res = await run_agent(_cfg("structured"), llm)
    data = result_to_dict(res)
    assert data["result_step"] == "turn2"
    assert [(c["step"], c["purpose"]) for c in data["calls"]] == [
        ("turn1", "turn"),
        ("turn2", "turn"),
        ("turn2", "assessment"),
    ]
    assert data["steps"] == {"turn1": "y", "turn2": "y", "conclude": "y"}
    assert "conclude" not in data["turn_latency_ms"]


async def test_result_to_dict_counts_and_config() -> None:
    res = await run_agent(_cfg("simple"), FakeLLM(["oops", ASK, ASK, CONCLUDE]))
    data = result_to_dict(res)
    assert data["llm_calls"] == 4 and data["repair_calls"] == 1
    assert data["cost_usd"] == pytest.approx(0.004)
    assert data["ok"] is True and data["error"] is None
    assert (data["architecture"], data["output_mode"]) == ("simple", "json_object")
    assert (data["send_temperature"], data["reasoning_effort"]) == (True, "low")
    first, repair = data["calls"][0], data["calls"][1]
    assert (first["purpose"], first["parsed_ok"], first["output_excerpt"]) == (
        "turn",
        False,
        "oops",
    )
    assert first["error"] and first["latency_ms"] == 5
    assert (repair["purpose"], repair["attempt"], repair["parsed_ok"]) == ("repair", 2, True)
    assert repair["output_excerpt"] is None  # only failed outputs are kept
    assert data["call_errors"] == [first["error"]]


async def test_result_to_dict_truncates_error_text() -> None:
    long_error = LLMError("HTTP 400: " + "x" * 2000)
    res = await run_agent(_cfg("simple"), FakeLLM([long_error]))
    data = result_to_dict(res)
    assert data["ok"] is False and data["steps"]["turn1"] == "n"
    assert len(data["error"]) == JSON_TEXT_LIMIT
    assert data["error"].startswith("LLMError: HTTP 400: xxx")
    assert len(data["call_errors"]) == 1 and len(data["call_errors"][0]) == JSON_TEXT_LIMIT
    assert data["calls"][0]["latency_ms"] >= 0  # no response: wall time of the attempt (D-038)
    assert data["failure_reason"] == "transport"


async def test_result_to_dict_keeps_output_of_failed_step() -> None:
    # parses fine but violates the forced conclusion → the step fails; keep the output
    res = await run_agent(_cfg("simple"), FakeLLM([ASK, ASK, ASK]))
    data = result_to_dict(res)
    assert data["steps"] == {"turn1": "y", "turn2": "y", "conclude": "n"}
    assert "after being told to conclude" in data["error"]
    concl = data["calls"][2]
    assert concl["parsed_ok"] is True and concl["output_excerpt"] == ASK[:JSON_TEXT_LIMIT]
    assert data["calls"][0]["output_excerpt"] is None


def test_write_json_missing_model(tmp_path: Path) -> None:
    path = tmp_path / "sub" / "run.json"
    write_json([SmokeResult("b-x", "x/y", False, error="model not found")], path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data[0]["agent_id"] == "b-x" and data[0]["model_found"] is False
    assert data[0]["calls"] == [] and data[0]["mean_turn_latency_ms"] is None
    assert data[0]["architecture"] is None


# --- formatting ----------------------------------------------------------------------------


def test_format_table() -> None:
    results = [
        SmokeResult("a-one", "x/one", True, "y", "y", "y", 1, 12345, 0.0012345),
        SmokeResult("b-two", "x/two", False, error="model not found"),
        SmokeResult("b-3", "x/3", None, "y", "n", "-", 0, 800, None, "E" * 100),
    ]
    lines = format_table(results).splitlines()
    assert len(lines) == 5
    assert lines[0].startswith("| agent") and "conclude" in lines[0] and "error" in lines[0]
    assert set(lines[1]) <= {"|", "-"}
    assert len({len(line) for line in lines}) == 1  # aligned
    assert "| a-one " in lines[2] and "| 12.3 " in lines[2] and "0.00123" in lines[2]
    assert "| n " in lines[3] and "model not found" in lines[3]
    assert "| ? " in lines[4] and "E" * 59 + "…" in lines[4] and "E" * 60 not in lines[4]


def test_format_table_turn_columns() -> None:
    r = SmokeResult("a-one", "x/one", True, "y", "y", "y", 2, 15000, 0.01)
    r.turn_latencies_ms = {"turn1": 2000, "turn2": 4500, "conclude": 8500}
    r.traces = [object()] * 5  # type: ignore[list-item]
    header, _, row = format_table([r]).splitlines()
    cells = [c.strip() for c in row.strip("|").split("|")]
    columns = [c.strip() for c in header.strip("|").split("|")]
    values = dict(zip(columns, cells, strict=True))
    assert (values["t1_s"], values["t2_s"], values["concl_s"]) == ("2.0", "4.5", "8.5")
    assert (values["mean_s"], values["max_s"]) == ("5.0", "8.5")
    assert (values["calls"], values["repairs"], values["total_s"]) == ("5", "2", "15.0")
    missing = format_table([SmokeResult("b", "m", False, error="model not found")])
    header, _, row = missing.splitlines()
    columns = [c.strip() for c in header.strip("|").split("|")]
    values = dict(zip(columns, [c.strip() for c in row.strip("|").split("|")], strict=True))
    assert [values[c] for c in ("t1_s", "t2_s", "concl_s", "mean_s", "max_s")] == ["-"] * 5
    assert values["calls"] == "0"


# --- /models -------------------------------------------------------------------------------


async def test_fetch_model_ids() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/api/v1/models"
        assert req.headers["Authorization"] == "Bearer k"
        return httpx.Response(200, json={"data": [{"id": "a/b"}, {"id": "c/d"}]})

    ids = await fetch_model_ids(
        "https://or.test/api/v1/", "k", transport=httpx.MockTransport(handler)
    )
    assert ids == {"a/b", "c/d"}
    bad = httpx.MockTransport(lambda _r: httpx.Response(401))
    with pytest.raises(LLMError, match="HTTP 401"):
        await fetch_model_ids("https://or.test/api/v1", "k", transport=bad)


# --- CLI commands --------------------------------------------------------------------------


@pytest.fixture
def agents_file(tmp_path: Path) -> str:
    path = tmp_path / "agents.yaml"
    path.write_text(TEST_AGENTS, encoding="utf-8")
    return str(path)


def test_list_agents(agents_file: str, capsys: pytest.CaptureFixture) -> None:
    assert cli.main(["list-agents", "--config", agents_file]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0].split() == [
        "id",
        "display_name",
        "architecture",
        "model",
        "enabled",
        "in_$/Mtok",
        "out_$/Mtok",
    ]
    assert len(out) == 6
    assert out[1].split() == [
        "a-simple",
        "دکتر",
        "۱",
        "simple",
        "test/simple-model",
        "yes",
        "1",
        "4",
    ]
    assert out[-1].split()[-3:] == ["no", "0.5", "1"]


def test_list_agents_repo_config(capsys: pytest.CaptureFixture) -> None:
    assert cli.main(["list-agents"]) == 0
    assert len(capsys.readouterr().out.splitlines()) == 15  # header + 14 agents


def test_list_agents_invalid_config(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("agents: [", encoding="utf-8")
    assert cli.main(["list-agents", "--config", str(bad)]) == 2
    assert "invalid YAML" in capsys.readouterr().err


@pytest.fixture
def offline_smoke(monkeypatch: pytest.MonkeyPatch) -> FakeLLM:
    llm = FakeLLM()

    async def fake_models(*_a: object, **_k: object) -> set[str]:
        return {"test/simple-model", "test/struct-model"}

    monkeypatch.setattr("app.smoke.fetch_model_ids", fake_models)
    monkeypatch.setattr("app.api.deps.get_llm", lambda: llm)
    return llm


def test_smoke_cli_selected_agent_ok(
    agents_file: str, offline_smoke: FakeLLM, capsys: pytest.CaptureFixture
) -> None:
    offline_smoke.push(ASK, ASK, CONCLUDE)
    rc = cli.main(["smoke-test", "--agent", "a-simple", "--config", agents_file])
    out = capsys.readouterr().out
    assert rc == 0, out
    assert "a-simple" in out and "b-struct" not in out


def test_smoke_cli_json_file(
    agents_file: str, offline_smoke: FakeLLM, tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    offline_smoke.push(ASK, ASK, CONCLUDE)
    path = tmp_path / "run.json"
    rc = cli.main(
        ["smoke-test", "--agent", "a-simple", "--config", agents_file, "--json", str(path)]
    )
    assert rc == 0
    assert f"wrote {path}" in capsys.readouterr().out
    data = json.loads(path.read_text(encoding="utf-8"))
    assert [d["agent_id"] for d in data] == ["a-simple"]
    assert data[0]["ok"] is True and data[0]["model_found"] is True
    assert set(data[0]["turn_latency_ms"]) == {"turn1", "turn2", "conclude"}


def test_smoke_cli_enabled_agents_missing_models_fail(
    agents_file: str, offline_smoke: FakeLLM, capsys: pytest.CaptureFixture
) -> None:
    offline_smoke.push(ASK, ASK, CONCLUDE, B_ASK, B_ASK, ASSESSMENT)
    rc = cli.main(["smoke-test", "--config", agents_file])
    out = capsys.readouterr().out
    assert rc == 1
    assert "Models not found" in out
    assert "a-capped: test/capped" in out and "b-capped: test/b-capped" in out
    assert "a-off" not in out  # disabled not included by default


def test_smoke_cli_include_disabled_and_unknown(
    agents_file: str, offline_smoke: FakeLLM, capsys: pytest.CaptureFixture
) -> None:
    rc = cli.main(["smoke-test", "--include-disabled", "--agent", "nope", "--config", agents_file])
    assert rc == 2 and "unknown agent" in capsys.readouterr().err
    offline_smoke.push(ASK, ASK, CONCLUDE, B_ASK, B_ASK, ASSESSMENT)
    cli.main(["smoke-test", "--include-disabled", "--config", agents_file])
    assert "a-off" in capsys.readouterr().out


def test_smoke_cli_models_endpoint_failure(
    agents_file: str, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    async def boom(*_a: object, **_k: object) -> set[str]:
        raise LLMError("GET /models failed: HTTP 401")

    monkeypatch.setattr("app.smoke.fetch_model_ids", boom)
    assert cli.main(["smoke-test", "--config", agents_file]) == 2
    assert "cannot list models" in capsys.readouterr().err


# --- phase 2d T1: serving provider in the table and the JSON -------------------------------


def _pr(text: str, provider: str | None, cached: int | None = None) -> LLMResponse:

    return LLMResponse(
        text=text,
        model_reported="m/x",
        prompt_tokens=100,
        completion_tokens=50,
        reasoning_tokens=None,
        cost_usd=0.001,
        latency_ms=5,
        raw={},
        provider=provider,
        cached_prompt_tokens=cached,
    )


async def test_provider_column_and_json_per_call() -> None:
    from app.smoke import format_providers

    # structured: turn1 = repair (last call Cerebras), turn2, conclude = assessment by Crusoe
    llm = FakeLLM(
        [
            _pr("bad", "DeepInfra"),
            _pr(B_ASK, "Cerebras", cached=64),
            _pr(B_ASK, "Cerebras"),
            _pr(ASSESSMENT, "Crusoe"),
        ]
    )
    cfg = _cfg("structured").model_copy(update={"provider_order": ["cerebras"]})
    res = await run_agent(cfg, llm)
    assert res.ok
    assert res.step_providers == {"turn1": "Cerebras", "turn2": "Cerebras", "conclude": "Crusoe"}
    assert format_providers(res) == "Cerebras/Cerebras/Crusoe"
    table = format_table([res])
    assert "provider" in table.splitlines()[0] and "Cerebras/Cerebras/Crusoe" in table
    data = result_to_dict(res)
    assert data["provider_order"] == ["cerebras"]
    assert data["step_providers"]["conclude"] == "Crusoe"
    assert [c["provider"] for c in data["calls"]] == ["DeepInfra", "Cerebras", "Cerebras", "Crusoe"]
    assert [c["cached_prompt_tokens"] for c in data["calls"]] == [None, 64, None, None]


async def test_provider_column_collapses_and_handles_missing() -> None:
    from app.smoke import format_providers

    same = await run_agent(
        _cfg("simple"), FakeLLM([_pr(ASK, "Groq")] * 2 + [_pr(CONCLUDE, "Groq")])
    )
    assert format_providers(same) == "Groq"
    none = await run_agent(_cfg("simple"), FakeLLM([ASK, ASK, CONCLUDE]))  # no provider field
    assert format_providers(none) == "-"
    failed = await run_agent(_cfg("simple"), FakeLLM([_pr(ASK, "Groq"), LLMError("down")]))
    assert failed.step_providers == {"turn1": "Groq", "turn2": None}
    assert format_providers(failed) == "Groq/-"
    missing = SmokeResult(agent_id="x", model="m", model_found=False)
    assert format_providers(missing) == "-"
