# Phase 1 Report — Backend Core

**Date:** 2026-09-30 · **Scope:** `backend/` · **Milestone:** M1 (backend core)

## 1. Summary

The backend core is complete. Tasks T1–T13 are done: auth, sessions and turns, the LLM gateway
(OpenRouter + tracing), architectures A (`simple`) and B (`structured`), the json_runner with a repair
retry, the deterministic guard, the agent registry with hot reload, feedback, evaluation and reveal,
admin metrics, CSV export, the CLI (`create-user`, `list-agents`, `smoke-test`), and a Docker image.
The API follows `API_CONTRACT.md` v1.

- **243 tests pass**, with no network access (the LLM is faked).
- **Coverage:** 97% line+branch for `app/`, and **100% line+branch for `guard.py`**.
- `ruff check` and `ruff format --check` are clean.
- `docker build -t triage-backend .` succeeds, and the container starts and serves the API.
- **The real smoke test was not run**, because no `OPENROUTER_API_KEY` is available (no `.env`, and the variable is not set in the environment).
- A key-less slug check against OpenRouter's public `GET /models` found that **2 of the 6 model slugs do not exist**: `google/gemini-3-flash` and `google/gemini-3.1-pro` (see §4).

## 2. What was built, per task

| Task | Built |
|---|---|
| T1 Scaffold | `uv` project (Python 3.12), ruff (line 100; E, F, I, B, UP), `app/settings.py` (all §13 vars, secrets as `SecretStr`), `.env.example`, FastAPI app with every router under `/api/v1`, CORS from `CORS_ORIGINS`. The global handlers always return `{"error": {code, message}}`: 422→400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, unhandled errors → 500 `INTERNAL_ERROR` (the stack trace is logged, never returned). All errors use `AppError(http_status, code, message)`. |
| T2 Database | SQLite engine with WAL and `foreign_keys=ON`; the parent directory is created automatically. SQLAlchemy 2 typed models for exactly the 9 tables in §7. JSON-in-TEXT helpers (`ensure_ascii=False`), UUID4 ids, timezone-aware UTC timestamps stored as ISO strings (naive datetimes are rejected). `init_db()` and `get_db()`. |
| T3 Auth | bcrypt (passlib), JWT HS256 `{sub, role, exp}`, `current_user` / `require_admin`, `POST /auth/login`, `GET /auth/me`, and the `create-user` CLI (getpass, at least 8 characters, duplicates refused). |
| T4 LLM layer | `LLMClient` protocol and models (§5). `OpenRouterClient` always sends `provider.data_collection=deny` and `usage.include=true`; it sends reasoning and temperature only when they are not null; it sets `response_format` per output mode (`json_schema` also sets `require_parameters`). It retries once after 2 s on network errors, 429, or 5xx; parses usage, reasoning tokens, and cost; measures latency; and raises a safe `LLMError`. The key is never logged or printed in `repr`. `FakeLLM` (scripted, records requests, cost 0.001). |
| T5 Clinical | All §2–§3 schemas and enums with their validators. `texts_fa.py` and the 5 prompt files are **generated from `AGENT_SPEC.md`**, and tests re-extract them from the spec to prove they are verbatim. The loader renders with `str.replace` only. |
| T6 json_runner | Strips fences and prose, validates, makes one repair retry (`repair.md` with the error truncated to 1500 characters), raises `AgentOutputError` after a second failure, and traces every attempt (including transport failures). |
| T7 Guard | G1–G5 as in §6.4, returning `(final, report, final_text)`. On G1 the patient message becomes `EMERGENCY_TEMPLATE_FA`. G4 works through a pre-validation hook on the raw JSON. 100% branch coverage. |
| T8 Registry & architectures | `config/agents.yaml` with exactly the 12 agents from the phase table (8 enabled). The registry deep-merges defaults, supports `send_temperature`, validates (unknown architecture, duplicate id or display name, unknown keys, slug format, prompt version), and provides `get`, `enabled`, `reload` (which keeps the old config on error), and `sync_to_db`. Architectures `simple` (role mapping; force conclude with the exact system line) and `structured` (turn payload with `previous_hypotheses`; state persisted after every turn call; assessment call). Both receive the `LLMClient` by injection. |
| T9 Sessions & turns | Blind agent list (sha256 per-user order); create, list, and get sessions; the message turn (atomic `turn_in_progress` lock, resend reuse, max-questions cap, persistence, totals, 502 `AGENT_ERROR` body with `patient_message`/`agent_message`); finish; ResultCard stats; backstage. Verified manually against the real app with the demo LLM (`/docs` served; full A and B flows). |
| T10 Feedback & evaluation | Feedback PUT/DELETE (owner only, agent question/result messages only, 409 `EVALUATION_LOCKED` after evaluation). Strict `EvaluationInput` validation. Checks for completed/not-yet-evaluated status and the comparison rules. After evaluation, the session includes `evaluation` and `reveal` (built from the session snapshot). |
| T11 Admin | Admin sessions list (with `user` and `agent_reveal`) and detail (reveal always, feedback from all users). Metrics per agent, architecture, or model: rates with null denominators, nearest-rank p50/p90, pairwise rules, safety-floor escalations. CSV export (`utf-8-sig`, one row per DB row, JSON kept as strings). Reload (400 keeps the previous config). |
| T12 CLI | `list-agents` table. `smoke-test` (checks `/models`, runs the scripted conversation in memory through the real architectures, prints a result table, sets the exit code). Unit tests with FakeLLM and a mocked `/models` endpoint. |
| T13 Packaging | `Dockerfile` (python:3.12-slim, uv, `uv sync --frozen --no-dev`, port 8000, `/app/data` volume), `.dockerignore`, README. |

Extra (B-018): `app/llm/demo.py` and `python -m app.dev_server` run the real API with an offline
demo LLM. This is useful for M2 frontend integration without API cost.

## 3. Test results and coverage

```
uv run pytest -q --cov=app --cov-branch
243 passed in ~35 s
TOTAL  1979 stmts, 40 missed, 290 branches, 15 partial → 97%

uv run pytest -q tests/test_guard.py --cov=app.agents.guard --cov-branch --cov-fail-under=100
app\agents\guard.py   32 stmts, 0 missed, 10 branches, 0 partial → 100%
```

Coverage is below 100% only in:
- `app/api/deps.py`: building the real OpenRouter client (always overridden in tests);
- a few defensive branches in `session_service`, `json_runner`, and `db/engine`;
- `dev_server.py` (the uvicorn entry point).

Test files: `test_app`, `test_db`, `test_auth`, `test_llm`, `test_clinical`, `test_json_runner`,
`test_guard`, `test_registry`, `test_architectures`, `test_sessions`, `test_evaluations`,
`test_admin`, `test_cli_smoke`, `test_demo_llm`.

## 4. Smoke test

**Not run.** No `OPENROUTER_API_KEY` is available: there is no `backend/.env`, and the variable is not
set in the environment.

As a key-less substitute, the public OpenRouter model list (`GET https://openrouter.ai/api/v1/models`,
464 models, fetched 2026-09-30) was checked against `config/agents.yaml`:

| Slug in `agents.yaml` | Agents | Exists? |
|---|---|---|
| `anthropic/claude-sonnet-5` | b-sonnet5, a-sonnet5 | ✅ |
| `openai/gpt-5.4` | b-gpt54, a-gpt54 | ✅ |
| `deepseek/deepseek-v4-pro` | b-deepseekv4pro, a-deepseekv4pro | ✅ |
| `openai/gpt-5-mini` | b-gpt5mini, a-gpt5mini | ✅ |
| `google/gemini-3-flash` | **b-gemini3flash (enabled)**, a-gemini3flash | ❌ **missing** |
| `google/gemini-3.1-pro` | **b-gemini31pro (enabled)**, a-gemini31pro | ❌ **missing** |

As instructed, the slugs were **not** replaced. For the product owner's decision, the Gemini 3.x ids
that do exist include `google/gemini-3-flash-preview` and `google/gemini-3.1-pro-preview` (also
`google/gemini-3.5-flash`, `…-3.6-flash`, `…-3.7-flash`, `…-3.8-flash`). Until `agents.yaml` is fixed,
sessions with `b-gemini3flash` and `b-gemini31pro` will fail with 502 `AGENT_ERROR` (OpenRouter
returns HTTP 400 for an unknown model).

**To run:** put the key in `backend/.env`, then run `uv run python -m app.cli smoke-test` (add
`--include-disabled` to also test the 4 disabled simple agents).

## 5. Decisions (B-001 … B-023)

All decisions are in `docs/decisions.md`. The most consequential are:

- **B-001:** No git repository existed. A repository was created **inside `backend/`**, with one `backend: …` commit per task. Fold it into a root repository later, as described in B-001.
- **B-002:** `bcrypt` is pinned below 4.1, because passlib 1.7.4 breaks with newer bcrypt.
- **B-004:** `TurnDecision.message_to_patient` must be empty on `conclude`, as the spec states ("iff"). `SimpleTurn` allows a non-empty conclude message, as its schema comment requires.
- **B-005:** G4 is a wrap validator on `AssessmentResult`. It maps unknown specialties before validation and exposes `specialty_invalid`.
- **B-008:** Guard coverage must be checked with `--cov=app.agents.guard`. The path form `--cov=app/agents/guard` from the phase prompt measures nothing, because coverage.py does not accept a bare file path.
- **B-009:** G2 is evaluated after G1 ("with G1 off" = "G1 did not escalate").
- **B-011:** Additions to the §5 interfaces: `TurnOutcome.raw_assessment`, `force_conclude(ctx, end_reason)`, `SessionContext.previous_hypotheses` and `save_clinical_state`.
- **B-012:** The max-questions cap is enforced in the service layer only.
- **B-015:** Turns run from the per-session config snapshot, so a reload never affects running sessions.
- **B-019 / B-020:** Feedback and evaluation are owner-only. `EvaluationInput` is validated strictly.
- **B-021:** Metric denominators. The INSUFFICIENT_INFO exclusion applies to the triage rates only, not to `specialty_match_rate`.

## 6. Contract change requests (open)

1. Evaluating a session a second time returns 409 with code `VALIDATION_ERROR`. The proposal is a dedicated `ALREADY_EVALUATED` code.
2. The contract defines no code for HTTP 405. The backend uses `METHOD_NOT_ALLOWED`.

Neither blocks the frontend. Both are implemented as described.

## 7. Known issues and risks

1. **Two invalid Gemini slugs** (§4). Two enabled agents will fail until `agents.yaml` is fixed.
2. **The real models have never been exercised.** The following are unverified until the smoke test runs:
   - JSON validity per model;
   - `json_object` support per provider;
   - reasoning and temperature acceptance (e.g. models that reject `temperature` need `send_temperature: false`).
3. **Architecture A sends the greeting as the first `assistant` message** (AGENT_SPEC §5 / phase prompt). Some providers require the first non-system message to be `user`. OpenRouter usually normalizes this, but the smoke test must confirm it for each model.
4. **Strict `TurnDecision` rule on conclude (B-004).** A model that writes a farewell in `message_to_patient` while concluding triggers a repair call, which adds cost and latency. If the smoke test shows this often, relax the rule with a recorded decision (the text is discarded anyway).
5. **`output_mode: json_schema` is untested against real providers.** The Pydantic JSON schema is not "strict-mode clean" (optional fields, defaults, `$defs`). `json_object` (the default) is unaffected.
6. **Sync SQLAlchemy inside async turn endpoints.** DB calls are short SQLite writes, and no transaction is held across the LLM call. This is fine for a few evaluators, not for load.
7. **The test suite takes about 35 s**, mostly bcrypt hashing when users are created. This is acceptable; hashing could be made cheaper in tests if needed.

## 8. Recommended next steps

1. **Product owner:** fix the two Gemini slugs in `config/agents.yaml`, add `OPENROUTER_API_KEY` to `backend/.env`, and run `uv run python -m app.cli smoke-test --include-disabled`. Then adjust `output_mode` and `send_temperature` per model based on the results.
2. **M2:** create `../docker-compose.yml` (backend + web, a `backend/data` volume, `backend/.env`). Integrate with the web app, first against `python -m app.dev_server`, then against real models. Verify the 401, 409, and 502-plus-resend paths from the UI.
3. Create the root git repository and fold in `backend/.git` (B-001). The web project also has no commits yet.
4. Decide the two open contract change requests.
5. **M3:** run about 10 role-play cases. Watch the repair rate (`llm_calls.purpose = 'repair'`), turn latency p50/p90, and cost per session on the admin dashboard before tuning prompts.
