# Backend Architecture — AI Triage Agent Lab (PoC)

**Status:** v1.1 (2026-09-30). Changes from v1.0: §5 hard-cap rule (D-023), §6.1 greeting fallback (D-025), §8 Gemini slugs (D-022), §12 access rule (D-020). Implementation-level additions to the §5 interfaces are recorded in B-011.
**Scope:** everything inside `backend/`. The system-level view (repo layout, deployment, doc ownership) is in `../../docs/SYSTEM_OVERVIEW.md`.
**Read with:** `../../docs/PRD.md`, `../../docs/API_CONTRACT.md`, `../../docs/decisions.md`, `AGENT_SPEC.md`

---

## 1. Principles

1. **LLM-agnostic.** Architectures depend on an `LLMClient` interface, never on a vendor SDK or a model-specific behavior.
2. **Agent = Architecture × Model × Config.** Agents are declared in `backend/config/agents.yaml`.
3. **One output contract.** Every architecture produces the same `AssessmentResult`, so the UI and the metrics treat all agents identically.
4. **Validate everything.** Every LLM output is parsed into a Pydantic model. Invalid output gets one repair retry; after that, the error is recorded. Output is never passed through silently.
5. **Trace everything.** Every LLM call is persisted with its cost and latency.
6. **Speed over sophistication.** Synchronous request/response, SQLite, no queues, no streaming.

## 2. Backend overview

```
HTTP (API_CONTRACT.md v1)
   │
   ▼
app/api/        routers: auth, agents, sessions, messages, evaluations, admin
   │
app/services/   session_service · evaluation_service · metrics_service · export_service
   │
app/agents/     registry (config/agents.yaml) · architectures/{simple,structured}
   │            · json_runner · guard · prompts/v1/*.md
   │
app/llm/        LLMClient protocol · OpenRouterClient · FakeLLM (tests)
   │
app/db/         SQLAlchemy models · SQLite (WAL)
```

## 3. Tech stack (fixed)

| Area | Choice |
|---|---|
| Language | Python 3.12, managed with `uv` (`pyproject.toml` + `uv.lock`) |
| Web | FastAPI, Uvicorn |
| Validation | Pydantic v2, `pydantic-settings` |
| DB | SQLite (WAL mode) via SQLAlchemy 2.x. Tables are created with `metadata.create_all` (no migrations; this is a PoC). DB file at `backend/data/lab.db` (git-ignored). |
| Auth | `passlib[bcrypt]` for password hashing; JWT (HS256, 12 h expiry) with `pyjwt` |
| HTTP client | `httpx` (async) |
| Config | YAML (`pyyaml`) + `.env` |
| Tests | `pytest`, `pytest-asyncio`, `httpx` / FastAPI `TestClient` |
| Lint/format | `ruff` |
| Container | `backend/Dockerfile` (python:3.12-slim, uv, uvicorn on port 8000) |

## 4. Folder layout (`backend/`)

```
backend/
├─ CLAUDE.md
├─ docs/                    # backend-only docs (owned by the backend coder, except AGENT_SPEC/BACKEND_ARCHITECTURE)
│  ├─ BACKEND_ARCHITECTURE.md
│  ├─ AGENT_SPEC.md
│  ├─ decisions.md
│  ├─ progress.md
│  ├─ contract-change-requests.md
│  └─ reports/
├─ app/
│  ├─ main.py                # FastAPI app, CORS, error handlers, routers under /api/v1
│  ├─ settings.py            # env settings
│  ├─ api/                   # routers
│  ├─ auth/                  # hashing, JWT, dependencies
│  ├─ db/                    # engine, models, session factory
│  ├─ schemas/               # Pydantic API schemas (mirror API_CONTRACT.md exactly)
│  ├─ services/
│  ├─ agents/
│  │  ├─ registry.py         # load/validate config/agents.yaml, reload
│  │  ├─ base.py             # Architecture protocol, TurnOutcome, SessionContext
│  │  ├─ clinical_schemas.py # ClinicalState, TurnDecision, SimpleTurn, AssessmentResult, enums
│  │  ├─ architectures/simple.py
│  │  ├─ architectures/structured.py
│  │  ├─ guard.py
│  │  ├─ json_runner.py      # call LLM → parse → repair retry → trace
│  │  ├─ texts_fa.py         # fixed Persian texts (AGENT_SPEC §2.3)
│  │  └─ prompts/v1/*.md     # prompt texts, verbatim from AGENT_SPEC.md
│  ├─ llm/
│  │  ├─ client.py
│  │  ├─ openrouter.py
│  │  └─ fake.py
│  └─ cli.py                 # create-user, list-agents, smoke-test
├─ config/agents.yaml
├─ data/                     # SQLite file (git-ignored)
├─ tests/
├─ .env.example
├─ Dockerfile
└─ pyproject.toml
```

## 5. Core interfaces

```python
# llm/client.py
class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMRequest(BaseModel):
    model: str
    messages: list[LLMMessage]
    temperature: float | None = None
    max_tokens: int = 4000
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None
    json_schema: dict | None = None  # used only when output_mode == "json_schema"
    output_mode: Literal["json_schema", "json_object", "prompt_only"] = "json_object"


class LLMResponse(BaseModel):
    text: str
    model_reported: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    reasoning_tokens: int | None
    cost_usd: float | None
    latency_ms: int
    raw: dict


class LLMClient(Protocol):
    async def complete(self, req: LLMRequest) -> LLMResponse: ...
```

```python
# agents/base.py
class TurnOutcome(BaseModel):
    kind: Literal["question", "result"]
    agent_message: str  # Persian text shown to the patient
    backstage: dict  # per-turn reasoning to persist (architecture-specific)
    assessment: AssessmentResult | None  # present iff kind == "result" (already guarded)
    guard_report: GuardReport | None


class Architecture(Protocol):
    name: str  # "simple" | "structured"

    async def next_turn(self, ctx: SessionContext) -> TurnOutcome: ...
    async def force_conclude(self, ctx: SessionContext) -> TurnOutcome: ...
```

`SessionContext` contains:
- the agent config,
- the transcript (a list of `{role: patient|agent, text}`),
- the current `clinical_state` (architecture B, or `None`),
- `questions_asked`,
- a `trace` callback that persists LLM calls.

**Hard-cap rule (D-023, ratifies B-012).** The cap is enforced **only in the service layer**. Before calling `next_turn`, if `questions_asked >= max_questions`, the service calls `force_conclude(ctx, "max_questions")`. A question returned at the cap is discarded the same way. Architectures do not check the cap.

## 6. Runtime flows

### 6.1 Architecture A — `simple` (1 LLM call per turn)

```
patient msg → build messages [system: A prompt] + transcript
            → json_runner(schema=SimpleTurn)
            → if action == "ask":      return question
            → if action == "conclude": guard(assessment) → return result
```

`force_conclude` makes the same call with an extra final system line: `"Conclude now. Set action to \"conclude\"."`

**Greeting fallback (D-025).** By default the static greeting is sent as the first `assistant` message. If the phase-2 smoke test shows that **any** model rejects or mishandles a conversation whose first non-system message is `assistant`, the greeting is omitted from the LLM message list for **all** architecture-A agents (it stays in the DB and the UI). One uniform rule keeps the comparison fair. The decision is recorded as a B-xxx entry with the evidence.

Backstage per turn: `{reasoning_note}`.

### 6.2 Architecture B — `structured` (1 call per turn + 1 final call)

```
patient msg → build [system: B turn prompt] + user payload {clinical_state, last_hypotheses,
              questions_asked, max_questions, transcript}
            → json_runner(schema=TurnDecision)
            → persist clinical_state (full replacement), hypotheses, can't-miss, emergency_probability, rationale
            → if next_action in {ask, clarify} and questions_asked < max_questions: return message_to_patient
            → else (conclude, or cap reached): assessment call
                  [system: B assessment prompt] + {clinical_state, transcript}
                  → json_runner(schema=AssessmentResult) → guard → return result
```

Backstage per turn: the full `TurnDecision` minus `message_to_patient`.

### 6.3 json_runner (shared)

1. Call the LLM with `output_mode` from the agent config.
2. Strip code fences and parse the JSON. Validate with Pydantic.
3. On failure: **one** repair retry. The previous output and the validation error are appended with the `repair` prompt from `AGENT_SPEC §7`.
4. On a second failure, raise `AgentOutputError`. The session service stores the error. The patient sees `ERROR_FA` (`AGENT_SPEC.md §2.3`), and the session stays `active` so the evaluator can resend.
5. Every attempt is written to `llm_calls` (success or failure).

HTTP/network errors: one retry after 2 s. Timeout: 60 s.

### 6.4 Guard (deterministic; `guard.py`)

Input: `AssessmentResult` and the agent options. Output: the final `AssessmentResult` plus a `GuardReport {actions: [...], raw_triage_level, final_triage_level, flags: [...]}`.

| Rule | Behavior |
|---|---|
| G1 Safety floor | If `options.safety_floor` and `emergency_probability >= options.emergency_threshold` and `triage_level != EMERGENCY_NOW`, then set `triage_level = EMERGENCY_NOW`, replace `patient_message` with `EMERGENCY_TEMPLATE_FA` (AGENT_SPEC §2.3), and add action `safety_floor_escalation`. |
| G2 Consistency flag | If `triage_level == EMERGENCY_NOW` and `emergency_probability < 0.10`, add flag `low_prob_emergency`. If `triage_level in {SELF_CARE, ROUTINE_DAYS}` and `emergency_probability >= 0.10` (with G1 off), add flag `high_prob_nonurgent`. These are flags only; nothing is changed. |
| G3 Differential | Keep at most 5 items, sorted by probability. If the probability sum is > 1.0, normalize and add flag `ddx_normalized`. |
| G4 Specialty | A code outside the closed list is mapped to `general_practice`, with flag `specialty_invalid`. |
| G5 Disclaimer | Append `DISCLAIMER_FA` to the patient-facing final message. This is always done. |

The guard must have 100% branch coverage in tests.

## 7. Data model (SQLite)

JSON columns are `TEXT` containing JSON. All ids are UUID4 strings. All timestamps are UTC ISO-8601.

| Table | Columns |
|---|---|
| `users` | id, username (unique), display_name, password_hash, role, created_at |
| `agents` | id (from yaml), display_name, description, architecture, model, config_json, enabled, updated_at. Synced from yaml at startup and on reload. |
| `sessions` | id, user_id, agent_id, agent_snapshot_json (config at start), status (`active`/`completed`), end_reason (`agent_concluded`/`max_questions`/`evaluator_ended`/null), questions_asked, clinical_state_json, created_at, completed_at, total_cost_usd, total_llm_latency_ms, turn_in_progress (bool) |
| `messages` | id, session_id, seq, role (`agent`/`patient`), kind (`greeting`/`question`/`result`/`error` for agent; `text` for patient), text, created_at, latency_ms (agent only) |
| `turn_backstage` | id, session_id, message_id (the agent message), data_json |
| `assessments` | id, session_id (unique), result_json (final), raw_result_json, guard_report_json, created_at |
| `llm_calls` | id, session_id, message_id (nullable), purpose (`turn`/`assessment`/`repair`), model, request_json, response_text, parsed_ok, error, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, latency_ms, attempt, created_at |
| `message_feedback` | id, message_id, user_id, rating (`up`/`down`), note, updated_at. Unique per (message_id, user_id). |
| `evaluations` | id, session_id (unique), user_id, data_json (the full form), created_at, updated_at |

**Concurrency.** When a patient message is posted, set `turn_in_progress = true` in a transaction. If it is already true, return 409 `TURN_IN_PROGRESS`. Clear it in `finally`.

## 8. Agent registry (`config/agents.yaml`)

```yaml
defaults:
  temperature: 0.3
  reasoning_effort: low          # sent only if model supports reasoning; ignored otherwise
  max_tokens: 4000
  output_mode: json_object       # json_schema | json_object | prompt_only
  prompt_version: v1
  options:
    max_questions: 12
    safety_floor: true
    emergency_threshold: 0.20

agents:
  - id: b-sonnet5
    display_name: "دکتر ۱"
    architecture: structured
    model: anthropic/claude-sonnet-5      # VERIFY slug
    enabled: true
  - id: a-sonnet5
    display_name: "دکتر ۲"
    architecture: simple
    model: anthropic/claude-sonnet-5
    enabled: true
  # ... one entry per architecture × model, see table below
```

The registry validates the file with Pydantic on load (fails fast: unknown architecture, duplicate id or display_name). `display_name` must be neutral and must not hint at the model.

Initial agent set:

| id | arch | model (verify slug) | enabled |
|---|---|---|---|
| b-sonnet5 | structured | anthropic/claude-sonnet-5 | ✓ |
| b-gpt54 | structured | openai/gpt-5.4 | ✓ |
| b-gemini31pro | structured | google/gemini-3.1-pro-preview (D-022) | ✓ |
| b-gpt5mini | structured | openai/gpt-5-mini | ✓ |
| b-gemini3flash | structured | google/gemini-3-flash-preview (D-022) | ✓ |
| b-deepseekv4pro | structured | deepseek/deepseek-v4-pro | ✓ |
| a-sonnet5 | simple | anthropic/claude-sonnet-5 | ✓ |
| a-gpt54 | simple | openai/gpt-5.4 | ✓ |
| a-gemini31pro | simple | google/gemini-3.1-pro-preview (D-022) | ✗ |
| a-gpt5mini | simple | openai/gpt-5-mini | ✗ |
| a-gemini3flash | simple | google/gemini-3-flash-preview (D-022) | ✗ |
| a-deepseekv4pro | simple | deepseek/deepseek-v4-pro | ✗ |

Display names "دکتر ۱" … "دکتر ۱۲" are assigned in a shuffled order (not grouped by model).

## 9. OpenRouter integration

- Endpoint: `POST {OPENROUTER_BASE_URL}/chat/completions` (default `https://openrouter.ai/api/v1`).
- Headers: `Authorization: Bearer ${OPENROUTER_API_KEY}`, `HTTP-Referer`, `X-Title: Triage Agent Lab`.
- Body additions:
  - `provider: {"data_collection": "deny"}`
  - `usage: {"include": true}`, so the response contains `usage.cost`
  - `reasoning: {"effort": <reasoning_effort>}` when set
  - `response_format` per output mode: `json_schema` → `{"type":"json_schema","json_schema":{...,"strict":true}}` together with `provider.require_parameters = true`; `json_object` → `{"type":"json_object"}`; `prompt_only` → omitted.
- Slug verification: `cli.py smoke-test` fetches `GET /models`, checks that every enabled agent's model exists, then runs one scripted 2-turn conversation per agent and reports JSON validity, latency, and cost. This must pass before physicians are onboarded.
- Because `base_url` is configurable, a local OpenAI-compatible server (vLLM/Ollama) can be used later without code changes.

## 10. Metrics computation (`metrics_service`)

Triage order: `EMERGENCY_NOW = 4`, `URGENT_24H = 3`, `ROUTINE_DAYS = 2`, `SELF_CARE = 1`. `INSUFFICIENT_INFO` is excluded from the ordering.

For each evaluated session with an evaluator verdict:
- `under = order(final) < order(verdict)`
- `over = order(final) > order(verdict)`
- `exact = final == verdict`
- `specialty_match = verdict_specialty in {primary, secondary}`

Aggregations are computed per agent, per architecture, and per model:
- the rates above, the mean of each KPI, and safety flag counts;
- mean questions per session;
- turn latency p50/p90 (from `messages.latency_ms`) and mean cost per session;
- 👍/👎 counts;
- pairwise wins/losses/ties (from `evaluations.compared_session_id`).

## 11. Testing strategy

- `FakeLLM` returns scripted responses, including invalid JSON to exercise the repair path.
- Unit tests: clinical schemas, json_runner (valid, repair success, repair failure), guard (100% branch coverage), registry validation, metrics math.
- API tests: auth, the full session lifecycle for both architectures with FakeLLM, the max-questions cap, force end, the 409 on concurrent turns, the evaluation reveal, feedback upsert, admin authorization, and CSV export.
- No real network in the test suite. The real-model check is `cli.py smoke-test` only.

## 12. Security (PoC level)

- Passwords are hashed with bcrypt. JWT secret comes from env. CORS is restricted to the frontend origin.
- Session-scoped endpoints are owner-only for every role, admins included. Admins read other users' sessions read-only through `/admin/*` (D-020).
- The OpenRouter key is kept server-side only.
- HTTPS is terminated by the host's reverse proxy at deployment.

## 13. Environment variables (`backend/.env`, template in `.env.example`)

| Var | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — (required) | OpenRouter key; never logged |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Swap for a local OpenAI-compatible server later |
| `APP_PUBLIC_URL` | `http://localhost:5173` | Sent as `HTTP-Referer` to OpenRouter |
| `JWT_SECRET` | — (required) | JWT signing |
| `JWT_EXPIRES_HOURS` | `12` | |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `DATABASE_PATH` | `data/lab.db` | |
| `AGENTS_CONFIG_PATH` | `config/agents.yaml` | |
| `LLM_TIMEOUT_SECONDS` | `60` | |

## 14. Local development

- `uv sync` installs dependencies.
- `uv run uvicorn app.main:app --reload --port 8000` runs the API at `http://localhost:8000/api/v1`.
- `uv run pytest` runs the tests.
- `uv run ruff check . && uv run ruff format .` lints and formats.
- `uv run python -m app.cli create-user --username X --display-name "دکتر ..." --role evaluator` creates a user (the password is prompted for).
- `uv run python -m app.cli smoke-test` checks the real models (requires the key; costs a few cents).
