# Backend Progress

Updated by the backend coder at the end of every task.

## Current status
**Phase 2c — Token and cost accounting (contract v1.2): in progress.**

| Task | Scope | Status |
|---|---|---|
| T1 | Pricing in the registry, snapshot, `list-agents` | ✅ Done (B-042) |
| T2 | Per-call estimate, session totals, schema check | ✅ Done (B-043, B-044) |
| T3 | API fields and blindness (contract v1.2), metrics, CSV | ⏳ |
| T4 | `cost-report` CLI | ⏳ |
| T5 | Dev server + DemoLLM verification | ⏳ |
| T6 | Report | ⏳ |

## Phase 2b-2 status
**Phase 2b-2 — Final model set, turn deadline, M3 gate: ✅ complete (2026-09-30).** Report: `reports/phase-2b2-model-set.md`.

- Spent: USD 0.89 of 3 (`/key` usage 0.8702 → 1.7616; smoke runs 0.43 + 0.40, compose ≈ 0.08).
- 322 tests pass; guard 100% line+branch; ruff clean.
- Final model set (D-034) in `agents.yaml`, all 7 slugs verified; DeepSeek `minimal`/8000 (D-036); 80 s turn / 50 s call deadlines (D-038).
- **Enabled agents for M3: 8** — `b-gptoss120b` disabled by the D-036 gate (conclusion deadline in both runs, B-040). D-037 misses: `b-deepseekv4pro` p50/p90, `a-gpt54` p90 (marginal).
- Uncommitted product-owner edits to `docs/BACKEND_ARCHITECTURE.md` were left out of the `backend:` commits (the coder may not edit that file).
- Next: phase 2c (cost accounting, D-035), then M3 QA with the 8 enabled agents.

| Task | Scope | Status |
|---|---|---|
| T1 | Final model set in `agents.yaml` (D-034, D-036), slugs verified | ✅ Done (B-037) |
| T2 | Turn deadline 80 s / call deadline 50 s (D-038) | ✅ Done (B-038) |
| T3 | Smoke test of the final set ×2, D-025 fixes | ✅ Done — no config change (B-039) |
| T4 | D-036 gate, D-037 targets, compose + nginx | ✅ Done (B-040, B-041) |
| T5 | Report `reports/phase-2b2-model-set.md` | ✅ Done |

## Phase 2b status
**Phase 2b — Real-model verification: ✅ complete (2026-09-30).** Report: `reports/phase-2b-real-model-verification.md`.

- Key valid (`GET /key` 200: limit USD 50, remaining 50, usage 0). Phase budget: USD 5.
- Spent: USD 0.87 of 5 (`/key` usage; smoke runs 0.41 + 0.39, rest T5).
- 306 tests pass; guard 100% line+branch; ruff clean. No `agents.yaml` change, no greeting fallback (B-034).
- Enabled agents: 7/8 pass the final run; `b-deepseekv4pro` failed after repair once and exceeds the 90 s client timeout at conclusion (both runs).
- **Action needed (product owner):** decide report §5.5 items 1–3 (DeepSeek-B for M3, latency target for B, total per-call deadline).
- Next: M2 integration report (product side), deployment, M3 QA.

| Task | Scope | Status |
|---|---|---|
| T1 | Preconditions: `.env` present, key valid without spending | ✅ Done |
| T2 | Smoke table: per-turn latency, calls, repairs; `--json` | ✅ Done |
| T3 | Real smoke test ×2 and D-025 rule-table fixes | ✅ Done — no config change (B-034) |
| T4 | Latency and repair check against NFR-2 | ✅ Done (analysis in report) |
| T5 | Real-model smoke through Docker Compose and nginx | ✅ Done (B-036) |
| T6 | Report `reports/phase-2b-real-model-verification.md` | ✅ Done |

## Phase 2 status
**Phase 2 — Contract v1.1, real-model verification, integration readiness: ✅ complete except T6 (blocked: no `OPENROUTER_API_KEY`) (2026-09-30).** Report: `reports/phase-2-integration-readiness.md`.

- 296 tests pass; coverage 98% (`app/`), guard 100% line+branch; ruff clean; `docker compose up --build` serves the app on :80.
- **Action needed (product owner):** add `OPENROUTER_API_KEY` (+ `JWT_SECRET`) to `backend/.env`, then the backend runs T6 steps 2–6 (smoke test ×2, ≤ USD 3; add per-turn latency to the smoke table first).
- Web integration: `uv run python -m app.dev_server --seed` (users `doctor`/`doctor2`/`admin`, 1.5 s delay, «خطا» → one 502).
- Next: T6 smoke test once the key exists; then M2 integration report (product side) and M3.

| Task | Scope | Status |
|---|---|---|
| T1 | Repository housekeeping (root repo, no tracked secrets, B-001 superseded) | ✅ Done |
| T2 | Error codes: 409 `EVALUATION_LOCKED` on second evaluation, 405/500 shape (D-018, D-019) | ✅ Done |
| T3 | Owner-only session endpoints for every role, list order (D-020) | ✅ Done |
| T4 | `TurnDecision` accepts a message on conclude (D-024) | ✅ Done |
| T5 | Dev server: `data/dev.db`, `--seed`, `--delay-ms`, «خطا» trigger; `create-user --password-stdin` (D-029) | ✅ Done |
| T6 | Gemini slugs and the real smoke test (D-022, D-025) | ⛔ blocked (no key) — step 1 done: Gemini slugs confirmed and set (B-030) |
| T7 | Root `docker-compose.yml` | ✅ Done |
| T8 | Docs and phase report | ✅ Done |

## Phase 1 status
**Phase 1 — Backend core: ✅ complete (2026-09-30).** Report: `reports/phase-1-backend-core.md`.

- 243 tests pass; coverage 97% (`app/`), 100% line+branch for `guard.py`; ruff clean; Docker image builds.
- ~~**Action needed (product owner):**~~ *(resolved in phase 2 T6, B-030)* `google/gemini-3-flash` and `google/gemini-3.1-pro` do not exist on
  OpenRouter (public `/models`, 2026-09-30) — agents `b-gemini3flash`, `b-gemini31pro` (enabled) and
  `a-gemini3flash`, `a-gemini31pro` will fail until `config/agents.yaml` is fixed. Existing candidates
  include `google/gemini-3-flash-preview` and `google/gemini-3.1-pro-preview` (not changed; no guessing).
- **Real smoke test not run:** no `OPENROUTER_API_KEY` available. Run `uv run python -m app.cli smoke-test --include-disabled` once `.env` exists.
- Next: M2 integration (`../docker-compose.yml`, web against `python -m app.dev_server`, then real models).

| Task | Scope | Status |
|---|---|---|
| T1 | Scaffold: uv project, ruff, settings, `.env.example`, FastAPI app, error handlers, `AppError`, README | ✅ Done |
| T2 | Database: SQLite engine (WAL, FK), SQLAlchemy models for §7 tables, `init_db`, `get_db` | ✅ Done |
| T3 | Auth: bcrypt, JWT, `current_user`/`require_admin`, `/auth/login`, `/auth/me`, CLI `create-user` | ✅ Done |
| T4 | LLM layer: client protocol, `OpenRouterClient`, `FakeLLM` | ✅ Done |
| T5 | Clinical schemas, Persian texts, prompts v1, prompt loader | ✅ Done |
| T6 | `json_runner` (fence stripping, repair retry, tracing) | ✅ Done |
| T7 | Guard G1–G5 (100% branch coverage) | ✅ Done |
| T8 | Registry (`config/agents.yaml`), base protocol, architectures `simple` and `structured` | ✅ Done |
| T9 | Sessions and turns (service + routers, locking, resend, cap, finish, 502) | ✅ Done |
| T10 | Feedback, evaluation, reveal | ✅ Done |
| T11 | Admin: sessions, metrics, CSV export, reload | ✅ Done |
| T12 | CLI `list-agents` and `smoke-test` | ✅ Done |
| T13 | Dockerfile, `.dockerignore`, README, final coverage check, phase report | ✅ Done |

Per task: `uv run pytest -q` + `uv run ruff check .`, update this file, commit (`backend: ...`).

## Log
<!-- - YYYY-MM-DD — task — what was done — tests — next -->
- 2026-09-29 — Phase 1 plan written. No git repository existed in the workspace; a repository was initialized inside `backend/` (see B-001).
- 2026-09-30 — T1 — uv project (Python 3.12), ruff, settings, .env.example, FastAPI app with contract error handlers and AppError, README — 4 tests pass
- 2026-09-30 — T2 — SQLite engine (WAL, FK), 9 typed models from §7, UTC datetime type, JSON helpers, init_db/get_db — 12 tests pass
- 2026-09-30 — T3 — bcrypt hashing, JWT HS256, current_user/require_admin, /auth/login + /auth/me, CLI create-user (getpass, min 8 chars, no duplicates) — 25 tests pass
- 2026-09-30 — T4 — LLMClient protocol + models, OpenRouterClient (provider deny, usage include, optional reasoning/temperature, response_format per mode, 1 retry on network/429/5xx, safe LLMError, key never logged), FakeLLM — 37 tests pass
- 2026-09-30 — T5 — clinical schemas + enums + validators, texts_fa (generated from spec), prompts v1 (verbatim), loader (str.replace rendering) — 91 tests pass
- 2026-09-30 — T6 — json_runner: fence/prose stripping, repair retry with repair.md, AgentOutputError, per-attempt TraceRecord (LLMError traced then re-raised) — 103 tests pass
- 2026-09-30 — T7 — guard G1–G5, 100% line+branch coverage (19 tests; see B-008 for the coverage command) — 122 tests pass
- 2026-09-30 — T8 — config/agents.yaml (12 agents), registry (merge, validation, reload keeps old config, sync_to_db), base protocol, architectures simple + structured — 154 tests pass
- 2026-09-30 — T9 — session service + routers: /agents (sha256 per-user order), create/list/get sessions, messages (lock, resend reuse, cap, 502 AGENT_ERROR), finish, result card, backstage; manual run via app.dev_server + DemoLLM OK (/docs 200, full A and B flows) — 176 tests pass
- 2026-09-30 — T10 — feedback PUT/DELETE (owner, kind, lock), evaluation (strict EvaluationInput, completed/once/comparison rules), reveal after evaluation — 203 tests pass
- 2026-09-30 — T11 — admin sessions list/detail, metrics (3 group_by values, nearest-rank percentiles, pairwise rules), CSV export (utf-8-sig), reload (400 keeps previous) — 224 tests pass
- 2026-09-30 — T12 — CLI list-agents + smoke-test (in-memory run through real architectures, model check, table, exit codes), 16 offline tests. Real smoke test NOT run: no OPENROUTER_API_KEY. Public GET /models slug check (no key): 4/6 slugs exist; google/gemini-3-flash and google/gemini-3.1-pro are MISSING (see phase report) — 240 tests pass
- 2026-09-30 — T13 — Dockerfile + .dockerignore (image builds and runs; API + CLI verified in container), README, DemoLLM tests; final: 243 tests, 97% coverage, guard 100%; phase report written
- 2026-09-30 — Phase 2 T1 — root repository verified (`git rev-parse --show-toplevel` = project root, no `backend/.git`, no tracked `.env`/`backend/data/*`); B-001 superseded by D-027; phase-2 task table added — 243 tests pass (baseline)
- 2026-09-30 — Phase 2 T2 — second evaluation → 409 `EVALUATION_LOCKED` (B-024; `test_evaluation_only_once` updated); new tests for 405 on a real route and 500 via a failing dependency (no stack trace); CCR #1/#2 accepted — 245 tests pass
- 2026-09-30 — Phase 2 T3 — GET session/messages/finish now owner-only for admins too (B-025), lists ordered `created_at` desc, `id` desc; new `tests/test_access.py` (6 endpoints × owner/other evaluator/admin matrix, unknown id → 404, admin read via `/admin/sessions/{id}`, ordering incl. equal timestamps); changed tests `test_sessions.py::test_get_session_access` (admin now gets 403 instead of 200 with reveal) and `test_admin.py::test_admin_sessions_list_and_detail` (admin `GET /sessions/{id}` on another user's session now 403 instead of 200 with empty feedback) — 279 tests pass
- 2026-09-30 — Phase 2 T4 — `TurnDecision` accepts and discards a message on conclude (B-026, B-004 partly superseded); `test_turn_decision_conclude_requires_empty_message` replaced by `..._accepts_and_discards_message`; new tests: farewell parses first time (no repair), empty ask → repair, stored/API backstage without `message_to_patient` — 284 tests pass
- 2026-09-30 — Phase 2 T5 — dev server `--db` (default `data/dev.db`, `lab.db` refused), `--seed`, `--delay-ms` (default 1500), «خطا» one-shot failure (session id via ASGI contextvar + transcript hash), `create-user --password-stdin`, README (B-027…B-029); manual run: `app.dev_server --seed` without `.env` → login `doctor` 200, one turn 1.57 s; PowerShell pipe to `--password-stdin` verified — 296 tests pass
- 2026-09-30 — Phase 2 T6 — blocked (no key): no `backend/.env`. Step 1 only: public `/models` confirms `google/gemini-3-flash-preview` and `google/gemini-3.1-pro-preview`, set for the 4 Gemini agents (B-030); smoke test, table extension (per-turn latency is missing), and provider fixes not run — 296 tests pass
- 2026-09-30 — Phase 2 T7 — root `docker-compose.yml` (backend + web); verified with a temporary `.env`: build OK, `GET /` 200 HTML, `GET /api/v1/agents` 401 contract shape, user via `exec -T backend uv run python -m app.cli … --password-stdin`, login 200, login still 200 after `restart backend`, `down` (B-031); README compose section — 296 tests pass
- 2026-09-30 — Phase 2 T8 — README (v1.1, dev server, `--password-stdin`, compose, smoke test), progress, decisions, phase report `reports/phase-2-integration-readiness.md` — 296 tests pass, guard 100%, ruff clean
- 2026-09-30 — Phase 2b T1 — the secrets file existed as untracked, **not git-ignored** `backend/env`; renamed to `backend/.env` (its own header names that path) so it is ignored and loaded (B-032). `OPENROUTER_API_KEY` and `JWT_SECRET` present (values not printed). `GET https://openrouter.ai/api/v1/key` → 200: limit 50, limit_remaining 50, usage 0 (USD) — no tests
- 2026-09-30 — Phase 2b T2 — smoke table gains `t1_s`/`t2_s`/`concl_s`, mean/max turn latency, LLM calls, repairs, total; `--json PATH` writes one object per agent (config, per-step latency, per-call trace incl. step/purpose/latency/cost/tokens, errors and failed-output excerpts ≤ 500 chars, replies, final level) (B-033). 9 new FakeLLM tests (fake clock) — 305 tests pass
- 2026-09-30 — Phase 2b T3 — real smoke run 1: 11/12 pass (USD 0.41); run 2: 10/12 pass (USD 0.39). No provider rejected any parameter; greeting-first conversations handled by all A agents → no config change, no greeting fallback (B-034). Kept failures: `a-gemini3flash` asks after the forced-conclude line (both runs); `b-deepseekv4pro` run 2 invalid JSON surviving repair (reasoning used 3998/4000 tokens). Calls of 68–86 s did not time out (B-035). `--json` keeps outputs of failed steps (+1 test) — 306 tests pass
- 2026-09-30 — Phase 2b T4 — final-run turn latency p50 12.4 s / p90 40.6 s (36 turns); A question turns p50 6.3 s, B 13.8 s (pooled); `b-deepseekv4pro` finish turn 105.6 / 106.8 s > 90 s client timeout in both runs; repair rate 0–25 % per agent. Recommendations in the report — no tests
- 2026-09-30 — Phase 2b T5 — no prior `lab.db` (nothing to back up); `docker compose up --build -d`; evaluator via `exec -T backend uv run … --password-stdin` (random password); through nginx: login 200, 8 agents, `b-sonnet5` 2 turns 200 (11.5 s, 13.6 s, questions), `a-gpt54` 2 turns 200 (4.0 s, 4.2 s), finish 200 → result + ResultCard (28.7 s); `down`, check-created `lab.db*` deleted, listing confirmed (B-036) — no tests
- 2026-09-30 — Phase 2b T6 — report `reports/phase-2b-real-model-verification.md`, README smoke-test section (`--json`, columns), progress, decisions; total spend USD 0.87 — 306 tests pass, guard 100%, ruff clean
- 2026-09-30 — Phase 2b-2 T1 — `/models` has all 7 D-034 slugs exactly; `agents.yaml`: sonnet5→sonnet55, gpt5mini→gpt54mini (in place), DeepSeek → `deepseek-v4-pro-0813` + `minimal`/8000 (D-036), new `b-gptoss120b` (enabled) / `a-gptoss120b`; 14 agents, 9 enabled; registry tests for the table, D-036 config and retired-id sync; README ids (B-037) — 307 tests pass
- 2026-09-30 — Phase 2b-2 T2 — `TurnBudget`/`DeadlineExceeded` (`app/llm/budget.py`); per-turn budget from the session service via `SessionContext.budget`; `json_runner` wraps each call in `asyncio.timeout(min(50, remaining))`, gates the repair on ≥ 15 s; OpenRouter skips its transport retry on < 15 s; B skips the assessment call on < 15 s (state kept); deadline attempts traced `deadline_exceeded` + latency; settings `LLM_CALL_DEADLINE_SECONDS`/`TURN_DEADLINE_SECONDS`, `.env.example`, README; smoke `reason` column (B-038). 15 new tests — 322 tests pass, guard 100%, ruff clean
- 2026-09-30 — Phase 2b-2 T3 — real smoke run 1: 12/14 pass (USD 0.43); run 2: 11/14 (USD 0.40); no provider 4xx → no D-025 change, no greeting fallback (B-039). Failures: `b-gptoss120b` conclude `deadline` ×2; `a-gemini3flash` ×2 and `a-deepseekv4pro` (run 2) ask after forced conclude. `/key` usage 1.6968 (phase spend 0.83) — no tests
- 2026-09-30 — Phase 2b-2 T4 gate — D-036 gate: `b-gptoss120b` disabled (conclusion deadline in both runs); 8 enabled agents; D-037 misses: `b-deepseekv4pro` p50/p90, `a-gpt54` p90 (B-040); analysis in `data/t4-2b2-analysis.txt` — 322 tests pass
- 2026-09-30 — Phase 2b-2 T4 compose — no prior `lab.db`; `docker compose up --build -d`; through nginx: login 200, 8 agents (no `b-gptoss120b`, `POST /sessions` → 404), `b-sonnet55` 2 turns 7.6 s / 7.6 s + finish 13.0 s → result, substitute `b-gpt54mini` 9.5 / 9.1 / 9.4 s → result; `down`, check-created `lab.db*` deleted (B-041) — no tests
- 2026-09-30 — Phase 2b-2 T5 — report `reports/phase-2b2-model-set.md`, README, progress, decisions; total spend USD 0.89 — 322 tests pass, guard 100%, ruff clean
- 2026-09-30 — Phase 2c T1 — `pricing` map in `agents.yaml` (7 models from public `/models`, exact ×1e6), `ModelPricing` validation (≥ 0, no unknown keys, every referenced model priced), price copied into `AgentConfig.pricing` → session snapshot; `list-agents` price columns; extra `/models` price fields recorded, not modeled (B-042). 11 new tests — 333 tests pass
- 2026-09-30 — Phase 2c T2 — reasoning-token finding from the 2b/2b-2 traces: `completion_tokens` includes reasoning for every model where it is observable (B-043); `llm_calls` price snapshot + `estimated_cost_usd`, `sessions` call count and token/estimate totals refreshed after every attempt; `init_db` schema check fails fast on pre-v1.2 files (B-044). 7 new tests — 340 tests pass
