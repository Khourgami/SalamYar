import json
import logging

import httpx
import pytest

from app.llm.client import LLMError, LLMMessage, LLMRequest
from app.llm.fake import FakeLLM
from app.llm.openrouter import OpenRouterClient

KEY = "sk-or-v1-VERY-SECRET-KEY-xyz"

OK_BODY = {
    "model": "openai/gpt-5.4-20260101",
    "choices": [{"message": {"role": "assistant", "content": '{"a": 1}'}}],
    "usage": {
        "prompt_tokens": 120,
        "completion_tokens": 30,
        "completion_tokens_details": {"reasoning_tokens": 12},
        "cost": 0.00042,
    },
}


def _req(**kw: object) -> LLMRequest:
    base: dict[str, object] = {
        "model": "openai/gpt-5.4",
        "messages": [
            LLMMessage(role="system", content="sys"),
            LLMMessage(role="user", content="u"),
        ],
    }
    base.update(kw)
    return LLMRequest(**base)  # type: ignore[arg-type]


class Recorder:
    def __init__(self, *responses: httpx.Response | Exception) -> None:
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def body(self, i: int = 0) -> dict:
        return json.loads(self.requests[i].content)


def _client(rec: Recorder) -> OpenRouterClient:
    return OpenRouterClient(
        api_key=KEY,
        base_url="https://or.test/api/v1/",
        retry_delay_seconds=0,
        transport=httpx.MockTransport(rec),
    )


async def test_request_body_and_headers() -> None:
    rec = Recorder(httpx.Response(200, json=OK_BODY))
    await _client(rec).complete(_req(temperature=0.3, reasoning_effort="low"))
    req = rec.requests[0]
    assert str(req.url) == "https://or.test/api/v1/chat/completions"
    assert req.headers["Authorization"] == f"Bearer {KEY}"
    assert req.headers["X-Title"] == "Triage Agent Lab"
    assert "HTTP-Referer" in req.headers
    body = rec.body()
    assert body["provider"] == {"data_collection": "deny"}
    assert body["usage"] == {"include": True}
    assert body["temperature"] == 0.3
    assert body["reasoning"] == {"effort": "low"}
    assert body["max_tokens"] == 4000
    assert body["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "u"},
    ]


async def test_reasoning_and_temperature_omitted_when_null() -> None:
    rec = Recorder(httpx.Response(200, json=OK_BODY))
    await _client(rec).complete(_req(temperature=None, reasoning_effort=None))
    body = rec.body()
    assert "temperature" not in body
    assert "reasoning" not in body


async def test_response_format_per_output_mode() -> None:
    rec = Recorder(*(httpx.Response(200, json=OK_BODY) for _ in range(3)))
    c = _client(rec)
    schema = {"name": "AssessmentResult", "schema": {"type": "object"}}
    await c.complete(_req(output_mode="json_object"))
    await c.complete(_req(output_mode="json_schema", json_schema=schema))
    await c.complete(_req(output_mode="prompt_only"))
    b0, b1, b2 = rec.body(0), rec.body(1), rec.body(2)
    assert b0["response_format"] == {"type": "json_object"}
    assert "require_parameters" not in b0["provider"]
    assert b1["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "AssessmentResult", "schema": {"type": "object"}, "strict": True},
    }
    assert b1["provider"] == {"data_collection": "deny", "require_parameters": True}
    assert "response_format" not in b2
    assert "require_parameters" not in b2["provider"]


async def test_usage_and_cost_parsed() -> None:
    rec = Recorder(httpx.Response(200, json=OK_BODY))
    resp = await _client(rec).complete(_req())
    assert resp.text == '{"a": 1}'
    assert resp.model_reported == "openai/gpt-5.4-20260101"
    assert resp.prompt_tokens == 120
    assert resp.completion_tokens == 30
    assert resp.reasoning_tokens == 12
    assert resp.cost_usd == pytest.approx(0.00042)
    assert resp.latency_ms >= 0
    assert resp.raw == OK_BODY


async def test_missing_usage_fields_are_none() -> None:
    body = {"choices": [{"message": {"content": None}}]}
    rec = Recorder(httpx.Response(200, json=body))
    resp = await _client(rec).complete(_req())
    assert resp.text == ""
    assert resp.cost_usd is None
    assert resp.reasoning_tokens is None
    assert resp.prompt_tokens is None


async def test_one_retry_on_500_then_success() -> None:
    rec = Recorder(
        httpx.Response(500, json={"error": {"message": "boom"}}), httpx.Response(200, json=OK_BODY)
    )
    resp = await _client(rec).complete(_req())
    assert len(rec.requests) == 2
    assert resp.text == '{"a": 1}'


async def test_llm_error_after_second_failure() -> None:
    rec = Recorder(httpx.Response(500), httpx.Response(429))
    with pytest.raises(LLMError, match="HTTP 429"):
        await _client(rec).complete(_req())
    assert len(rec.requests) == 2


async def test_retry_on_network_error() -> None:
    rec = Recorder(httpx.ConnectError("down"), httpx.ReadTimeout("slow"))
    with pytest.raises(LLMError, match="ReadTimeout"):
        await _client(rec).complete(_req())
    assert len(rec.requests) == 2


async def test_no_retry_on_400() -> None:
    rec = Recorder(httpx.Response(400, json={"error": {"message": "bad model"}}))
    with pytest.raises(LLMError, match="HTTP 400: bad model"):
        await _client(rec).complete(_req())
    assert len(rec.requests) == 1


async def test_no_choices_is_error() -> None:
    rec = Recorder(httpx.Response(200, json={"error": {"message": "provider failed"}}))
    with pytest.raises(LLMError, match="no choices: provider failed"):
        await _client(rec).complete(_req())


async def test_key_never_logged(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    rec = Recorder(
        httpx.Response(500, json={"error": {"message": "x"}}),
        httpx.Response(200, json=OK_BODY),
        httpx.ConnectError("down"),
        httpx.Response(503),
    )
    c = _client(rec)
    await c.complete(_req())
    with pytest.raises(LLMError) as exc_info:
        await c.complete(_req())
    assert caplog.records, "expected some log output"
    assert KEY not in caplog.text
    assert "Authorization" not in caplog.text
    assert KEY not in str(exc_info.value)
    assert KEY not in repr(c)


async def test_fake_llm() -> None:
    fake = FakeLLM(["one", ValueError("boom")])
    r = await fake.complete(_req())
    assert r.text == "one"
    assert r.cost_usd == 0.001
    with pytest.raises(ValueError):
        await fake.complete(_req())
    assert len(fake.requests) == 2
    with pytest.raises(AssertionError):
        await fake.complete(_req())
