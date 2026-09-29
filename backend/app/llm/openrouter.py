"""OpenRouter client over the OpenAI-compatible chat completions API (BACKEND_ARCHITECTURE §9).

The API key is only ever placed in the Authorization header and is never logged.
"""

import asyncio
import logging
import time
from typing import Any

import httpx

from app.llm.client import LLMError, LLMRequest, LLMResponse

logger = logging.getLogger(__name__)

APP_TITLE = "Triage Agent Lab"
RETRY_STATUSES = {429} | set(range(500, 600))


class OpenRouterClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://openrouter.ai/api/v1",
        referer: str = "http://localhost:5173",
        timeout_seconds: float = 60,
        retry_delay_seconds: float = 2.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.referer = referer
        self.timeout_seconds = timeout_seconds
        self.retry_delay_seconds = retry_delay_seconds
        self._transport = transport

    def __repr__(self) -> str:  # never expose the key
        return f"OpenRouterClient(base_url={self.base_url!r})"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": self.referer,
            "X-Title": APP_TITLE,
            "Content-Type": "application/json",
        }

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.timeout_seconds, transport=self._transport)

    @staticmethod
    def build_body(req: LLMRequest) -> dict[str, Any]:
        provider: dict[str, Any] = {"data_collection": "deny"}
        body: dict[str, Any] = {
            "model": req.model,
            "messages": [m.model_dump() for m in req.messages],
            "max_tokens": req.max_tokens,
            "provider": provider,
            "usage": {"include": True},
        }
        if req.temperature is not None:
            body["temperature"] = req.temperature
        if req.reasoning_effort is not None:
            body["reasoning"] = {"effort": req.reasoning_effort}
        if req.output_mode == "json_object":
            body["response_format"] = {"type": "json_object"}
        elif req.output_mode == "json_schema":
            schema = dict(req.json_schema or {})
            schema["strict"] = True
            body["response_format"] = {"type": "json_schema", "json_schema": schema}
            provider["require_parameters"] = True
        return body

    @staticmethod
    def parse_response(data: dict[str, Any], latency_ms: int) -> LLMResponse:
        choices = data.get("choices") or []
        if not choices:
            err = data.get("error")
            detail = err.get("message") if isinstance(err, dict) else None
            raise LLMError(
                f"OpenRouter returned no choices{': ' + str(detail)[:300] if detail else ''}"
            )
        message = choices[0].get("message") or {}
        usage = data.get("usage") or {}
        details = usage.get("completion_tokens_details") or {}
        cost = usage.get("cost")
        return LLMResponse(
            text=message.get("content") or "",
            model_reported=data.get("model"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            reasoning_tokens=details.get("reasoning_tokens"),
            cost_usd=float(cost) if cost is not None else None,
            latency_ms=latency_ms,
            raw=data,
        )

    async def complete(self, req: LLMRequest) -> LLMResponse:
        body = self.build_body(req)
        url = f"{self.base_url}/chat/completions"
        last_error = "unknown error"
        for attempt in (1, 2):
            if attempt == 2:
                await asyncio.sleep(self.retry_delay_seconds)
            started = time.perf_counter()
            try:
                async with self._client() as client:
                    resp = await client.post(url, json=body, headers=self._headers())
            except httpx.HTTPError as exc:
                last_error = f"network error: {type(exc).__name__}"
                logger.warning(
                    "OpenRouter %s attempt %d failed: %s", req.model, attempt, last_error
                )
                continue
            latency_ms = int((time.perf_counter() - started) * 1000)
            if resp.status_code in RETRY_STATUSES:
                last_error = f"HTTP {resp.status_code}{_error_detail(resp)}"
                logger.warning(
                    "OpenRouter %s attempt %d failed: %s", req.model, attempt, last_error
                )
                continue
            if resp.status_code >= 400:
                raise LLMError(f"OpenRouter HTTP {resp.status_code}{_error_detail(resp)}")
            try:
                data = resp.json()
            except ValueError as exc:
                raise LLMError("OpenRouter returned a non-JSON response") from exc
            logger.info("OpenRouter %s ok in %d ms", req.model, latency_ms)
            return self.parse_response(data, latency_ms)
        raise LLMError(f"OpenRouter request failed after retry: {last_error}")


def _error_detail(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error")
    except ValueError:
        return ""
    if isinstance(err, dict) and err.get("message"):
        return f": {str(err['message'])[:300]}"
    return ""
