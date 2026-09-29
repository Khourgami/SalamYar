import json
from pathlib import Path

import httpx
import pytest

from app import cli
from app.agents.config import AgentConfig
from app.llm.client import LLMError
from app.llm.fake import FakeLLM
from app.smoke import (
    PATIENT_MESSAGES,
    SmokeResult,
    exit_code,
    fetch_model_ids,
    format_table,
    run_agent,
    smoke_test,
)
from tests.lab import ASK, ASSESSMENT, B_ASK, CONCLUDE, TEST_AGENTS


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
    assert out[0].split() == ["id", "display_name", "architecture", "model", "enabled"]
    assert len(out) == 6
    assert out[1].split() == ["a-simple", "دکتر", "۱", "simple", "test/simple-model", "yes"]
    assert out[-1].split()[-1] == "no"


def test_list_agents_repo_config(capsys: pytest.CaptureFixture) -> None:
    assert cli.main(["list-agents"]) == 0
    assert len(capsys.readouterr().out.splitlines()) == 13


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
