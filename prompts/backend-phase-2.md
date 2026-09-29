# Backend Phase 2 — Contract v1.1, Real-Model Verification, Integration Readiness

You are a **senior Python backend engineer** (FastAPI, Pydantic v2, SQLAlchemy 2, pytest, Docker) with hands-on experience integrating LLM APIs through OpenRouter. You continue the `backend/` project of the AI Triage Agent Lab. Phase 1 is complete (243 tests, guard 100% branch coverage). The development machine is Windows 11 with Docker Desktop; use PowerShell-compatible commands.

## 1. Read first, in this order

1. `backend/CLAUDE.md`
2. `docs/decisions.md` — especially the new **D-018 … D-029**
3. `docs/API_CONTRACT.md` — now **v1.1**; start with the changelog at the top
4. `docs/SYSTEM_OVERVIEW.md` (§3 ownership, §5 deployment, §6 git, §7 integration checklist)
5. `backend/docs/BACKEND_ARCHITECTURE.md` v1.1 and `backend/docs/AGENT_SPEC.md` v1.1
6. `backend/docs/decisions.md`, `backend/docs/progress.md`, `backend/docs/reports/phase-1-backend-core.md`, `backend/docs/contract-change-requests.md`

## 2. Rules

- **Boundary.** Write only inside `backend/`, plus the root `docker-compose.yml` (T7), which `SYSTEM_OVERVIEW.md §3` assigns to you. Never edit `docs/`, `web/`, `backend/docs/AGENT_SPEC.md`, or `backend/docs/BACKEND_ARCHITECTURE.md`.
- **Prompts are frozen.** Do not change any file in `app/agents/prompts/v1/` (B-006). No prompt tuning in this phase.
- **No scope creep.** No new endpoints or response fields. The only new CLI/dev-server options are those listed in T5.
- **Conflicts.** If these instructions conflict with the docs or the code, or something is ambiguous: choose the more conservative option, record a `B-xxx` decision, and continue. If it touches the API contract, add a row to `contract-change-requests.md` and keep implementing the contract as written.
- **Git (D-027).** The repository is at the project root on `main`; `backend/.git` no longer exists. From the repository root, stage only your paths — `git add -- backend docker-compose.yml` — never `git add -A` or `git add .` at the root. The frontend coder works in the same working tree at the same time: if `.git/index.lock` exists, wait a few seconds and retry; never delete it. If a remote exists, `git pull --rebase` before committing. Commit prefix `backend:`, at least one commit per task. Never commit `.env` or `backend/data/`.
- **Per-task loop:** implement → write the task's tests → `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .` all green → guard coverage still 100% (`uv run pytest tests/test_guard.py --cov=app.agents.guard --cov-branch --cov-fail-under=100`) → update `backend/docs/progress.md` (task table + one log line) and `backend/docs/decisions.md` (every decision you made) → commit.

## 3. Tasks

### T1 — Repository housekeeping

- Verify that `git rev-parse --show-toplevel` is the project root and that `backend/.git` does not exist. If there is no root repository, **stop the whole phase** and report it (do not create one).
- Verify with `git ls-files` that no `.env` or `backend/data/*` file is tracked.
- In `backend/docs/decisions.md`, set B-001's status to `Superseded by D-027`.
- Add a "Phase 2" task table (T1–T8) to `backend/docs/progress.md`.

**Done when:** the checks pass, B-001 is superseded, and the full test suite is green (baseline 243).
**Tests:** none new.

### T2 — Error codes (D-018, D-019)

- A second `POST /sessions/{id}/evaluation` returns **409 `EVALUATION_LOCKED`** (it currently returns 409 `VALIDATION_ERROR`). Keep the existing check order; only the code changes.
- Confirm that 405 `METHOD_NOT_ALLOWED` and 500 `INTERNAL_ERROR` use the contract error shape.
- In `contract-change-requests.md`, set #1 to `accepted — resolved with EVALUATION_LOCKED instead of ALREADY_EVALUATED (D-018)` and #2 to `accepted (D-019)`.

**Tests:** second evaluation → 409 `EVALUATION_LOCKED` in the contract shape; wrong method on an existing route → 405 shape; an unhandled exception (a test-only route or a patched dependency) → 500 `INTERNAL_ERROR` with no stack trace in the body.
**Done when:** the tests pass and the CCR file is updated.

### T3 — Owner-only session endpoints and list order (D-020, contract §5–§7)

- These endpoints require the caller to own the session, **for every role including admin**; otherwise 403 `FORBIDDEN`: `GET /sessions/{id}`, `POST /sessions/{id}/messages`, `POST /sessions/{id}/finish`, `PUT /messages/{id}/feedback`, `DELETE /messages/{id}/feedback`, `POST /sessions/{id}/evaluation`. An unknown id → 404 before the ownership check.
- `GET /sessions` returns the caller's own sessions for every role (verify).
- `GET /sessions` and `GET /admin/sessions` are ordered by `created_at` desc, then `id` desc.
- `/admin/*` behavior is otherwise unchanged.
- First audit the current behavior and change only what differs. If an existing test asserts that an admin can use one of these endpoints on another user's session, change the test and name it in the log line.

**Tests:** a parametrized matrix over the 6 endpoints × {owner → success, other evaluator → 403, admin who is not the owner → 403}; unknown id → 404 for each; the same session read by the admin via `GET /admin/sessions/{id}` → 200 with `reveal`; ordering of both lists with 3 sessions created in sequence.
**Done when:** the matrix passes.

### T4 — Accept a message on conclude in `TurnDecision` (D-024)

- `TurnDecision`: a non-empty `message_to_patient` stays **required** for `ask`/`clarify`. For `conclude`, any value is accepted and discarded: it is never shown and never stored in `turn_backstage` (the backstage already excludes `message_to_patient`; verify). `SimpleTurn` is unchanged.
- In `backend/docs/decisions.md`, mark the strict-conclude part of B-004 as `Superseded by D-024` (keep the rest of B-004).

**Tests (FakeLLM):** a `conclude` with a non-empty farewell parses on the first attempt (exactly one LLM call, no `repair` trace); an `ask` with an empty message still fails and triggers a repair; the concluding turn's backstage has no `message_to_patient` key.
**Done when:** the tests pass.

### T5 — Dev server for web integration (D-029)

Extend `uv run python -m app.dev_server` (DemoLLM, never calls OpenRouter):

- **Database:** default `data/dev.db`; never `data/lab.db`. Option `--db <path>`.
- **`--seed`:** idempotently creates these users (create only if the username does not exist; never overwrite a password):

  | username | password | role | display name |
  |---|---|---|---|
  | `doctor` | `doctor123` | evaluator | «دکتر آزمایشی» |
  | `doctor2` | `doctor123` | evaluator | «دکتر آزمایشی ۲» |
  | `admin` | `admin123` | admin | «مدیر» |

- **`--delay-ms N`** (default `1500`): DemoLLM sleeps `N` ms per call (async sleep), so the typing indicator and 409 `TURN_IN_PROGRESS` can be observed.
- **Failure trigger:** the first time DemoLLM processes a transcript whose last patient message contains `خطا`, it returns invalid JSON on every attempt (so the turn ends in 502 `AGENT_ERROR` after the repair retry). The next processing of the same transcript (the client's resend) answers normally. Key the "seen" set by session id + patient message id if DemoLLM can access them, otherwise by a hash of the full transcript.
- On start-up, print the URL, the database path, and the seeded usernames (not the passwords).
- **`create-user --password-stdin`:** reads the password from the first line of stdin instead of `getpass`, with the same validation (≥ 8 characters, no duplicate username). For container and scripted use.
- Document both in `backend/README.md` (Windows PowerShell examples, e.g. `"secret123" | uv run python -m app.cli create-user --username qa --display-name "QA" --role evaluator --password-stdin`).

**Tests:** seeding twice leaves exactly 3 users with unchanged hashes; the dev DB path default is `data/dev.db`; with the trigger, the first `POST /messages` → 502 with the contract body, the session stays active, and a resend of the identical text → 200 without a duplicated patient message; `--delay-ms` is applied (patch the sleep and assert the argument; no real waiting in tests); `--password-stdin` succeeds and rejects a 7-character password.
**Done when:** the tests pass and a manual run of `uv run python -m app.dev_server --seed` serves `/api/v1/auth/login` for `doctor`.

### T6 — Gemini slugs and the real smoke test (D-022, D-025)

**Precondition:** `backend/.env` contains `OPENROUTER_API_KEY` (the product owner adds it). If it is missing, do only step 1, mark T6 as `blocked (no key)` in the progress file, and continue with T7.

1. Fetch `GET https://openrouter.ai/api/v1/models`. Confirm that `google/gemini-3-flash-preview` and `google/gemini-3.1-pro-preview` exist, and set them for the 4 Gemini agents in `config/agents.yaml`. If either id is not present **exactly**, do not substitute anything: leave those agents unchanged and report it.
2. Run `uv run python -m app.cli smoke-test --include-disabled` **twice**. **Budget:** stop running real calls once the cumulative reported cost exceeds **USD 3**, and report where you stopped.
3. If the smoke-test table does not already show, per agent, JSON validity per turn, the number of repair calls, per-turn latency, and cost, extend the table (small, tested change).
4. Apply **only** these fixes, per model (to both of that model's agents), each as a YAML comment `# B-0xx` next to the change plus a `B-xxx` decision quoting the provider's error text:

   | Evidence (in the trace or smoke output) | Fix |
   |---|---|
   | The provider rejects `temperature` | `send_temperature: false` for that model |
   | The provider rejects `response_format` / `json_object` | `output_mode: prompt_only` for that model |
   | The provider rejects the `reasoning` parameter | `reasoning_effort: null` for that model |
   | Any model rejects, or answers incorrectly, a conversation whose first non-system message is `assistant` (architecture A) | Greeting fallback for **all** architecture-A agents (`BACKEND_ARCHITECTURE.md §6.1`): omit leading greeting messages from the LLM message list; the DB and API are unchanged. Unit-test the message builder. |
   | Invalid JSON that survives the repair, or anything else | **No fix.** Keep the agent's config and `enabled` flag unchanged and report it with the trace excerpt. |

5. After fixes, re-run the smoke test (within the budget) until every agent passes or its failure is in the "No fix" row.
6. Record the final results in the report (T8): per agent — model, `output_mode`, pass/fail per run, repairs, mean and max turn latency, cost per conversation. Compare latency with NFR-2 (p50 ≤ 8 s, p90 ≤ 20 s) and the web client's 90 s turn timeout.

**Tests:** the registry still validates the new `agents.yaml` (existing tests); unit tests for any code change (smoke table, greeting fallback). No network in the test suite.
**Done when:** slugs are handled per step 1, the smoke results are recorded, and every config change has a `B-xxx` decision.

### T7 — Root `docker-compose.yml` (`SYSTEM_OVERVIEW.md §5`)

- Two services:
  - `backend`: `build: ./backend`, `env_file: ./backend/.env`, volume `./backend/data:/app/data`, port 8000 **not** published, `restart: unless-stopped`.
  - `web`: `build: ./web`, `ports: ["80:80"]`, `environment: API_UPSTREAM=http://backend:8000`, `depends_on: [backend]`, `restart: unless-stopped`.
- Do not edit anything under `web/`. If the web image fails to build, report the error and continue.
- Document in `backend/README.md` the exact command to create a user inside the running container with `--password-stdin` (use whatever invocation works in the slim image, e.g. the venv's `python -m app.cli …`; verify it).
- **Verify** (requires `backend/.env`; if absent, create a temporary `.env` with a dummy key and a random `JWT_SECRET` for this check only, never committed, and delete it afterwards):
  1. `docker compose up --build -d`
  2. `GET http://localhost/` → 200 HTML
  3. `GET http://localhost/api/v1/agents` → 401 in the contract error shape
  4. create a user in the container, then `POST http://localhost/api/v1/auth/login` → 200
  5. `docker compose restart backend` → the user still logs in (the volume persists `lab.db`)
  6. `docker compose down`

**Tests:** none automated; paste the verification commands and results into the report.
**Done when:** all six steps pass (or step 2 is reported as a web-image issue).

### T8 — Docs and phase report

- Update `backend/README.md` (dev server and seeding, `--password-stdin`, compose, smoke test).
- Update `backend/docs/progress.md` (current status, all tasks, log lines).
- Write **`backend/docs/reports/phase-2-integration-readiness.md`** in English: summary; what changed per task; the smoke-test results table (T6 step 6); every config change with its reason; new `B-xxx` decisions; the status of the contract change requests; known issues and risks (including repair rate, latency vs NFR-2, and any agent in the "No fix" row); recommended next steps for M2 and M3.

**Done when:** the report exists, everything is green, and all work is committed.

## 4. Definition of done (phase)

- All tests pass; guard branch coverage is 100%; ruff is clean.
- The contract v1.1 behaviors (T2, T3) are implemented and tested.
- D-024 is implemented (T4).
- `app.dev_server --seed` works with delay and the «خطا» trigger (T5).
- The Gemini slugs are resolved and the real smoke test has been run within budget, or T6 is explicitly `blocked (no key)` (T6).
- `docker compose up --build` serves the app on port 80 (T7).
- `progress.md`, `decisions.md`, the CCR file, the README, and the phase-2 report are up to date, and everything is committed with `backend:` prefixes.
