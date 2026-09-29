# Backend Progress

Updated by the backend coder at the end of every task.

## Current status
**Phase 2 — Contract v1.1, real-model verification, integration readiness: 🚧 in progress (2026-09-30).**

| Task | Scope | Status |
|---|---|---|
| T1 | Repository housekeeping (root repo, no tracked secrets, B-001 superseded) | ✅ Done |
| T2 | Error codes: 409 `EVALUATION_LOCKED` on second evaluation, 405/500 shape (D-018, D-019) | ✅ Done |
| T3 | Owner-only session endpoints for every role, list order (D-020) | ✅ Done |
| T4 | `TurnDecision` accepts a message on conclude (D-024) | ✅ Done |
| T5 | Dev server: `data/dev.db`, `--seed`, `--delay-ms`, «خطا» trigger; `create-user --password-stdin` (D-029) | ✅ Done |
| T6 | Gemini slugs and the real smoke test (D-022, D-025) | ⛔ blocked (no key) — step 1 done: Gemini slugs confirmed and set (B-030) |
| T7 | Root `docker-compose.yml` | ✅ Done |
| T8 | Docs and phase report | ⏳ Todo |

## Phase 1 status
**Phase 1 — Backend core: ✅ complete (2026-09-30).** Report: `reports/phase-1-backend-core.md`.

- 243 tests pass; coverage 97% (`app/`), 100% line+branch for `guard.py`; ruff clean; Docker image builds.
- **Action needed (product owner):** `google/gemini-3-flash` and `google/gemini-3.1-pro` do not exist on
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
