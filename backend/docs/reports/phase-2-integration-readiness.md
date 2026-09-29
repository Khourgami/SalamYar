# Backend Phase 2 — Contract v1.1, Real-Model Verification, Integration Readiness

**Date:** 2026-09-30 · **Status:** complete except T6 steps 2–6, which are blocked because no `OPENROUTER_API_KEY` exists (`backend/.env` is absent).

## 1. Summary

The backend now implements API contract **v1.1**:

- a second evaluation returns 409 `EVALUATION_LOCKED`;
- 405 and 500 responses use the contract error shape;
- session endpoints are owner-only for every role, admins included;
- both session lists are ordered newest first.

D-024 is implemented: `TurnDecision` accepts and discards a message on conclude. The offline dev server is ready for web integration: `data/dev.db`, `--seed`, simulated latency, and the one-shot «خطا» failure. Scripted user creation works through `--password-stdin`. The Gemini slugs were confirmed on OpenRouter and set. The root `docker-compose.yml` serves the whole app on port 80, and all six verification steps passed.

The **real smoke test has not been run** (no key). Until it passes, the per-model provider settings (D-025) are unverified. This is the main remaining risk before M2 sign-off.

| Check | Result |
|---|---|
| `uv run pytest -q` | **296 passed** (baseline 243; +53) |
| Coverage `app/` (line+branch) | 98% |
| Guard `--cov=app.agents.guard --cov-branch --cov-fail-under=100` | 100% (19 tests) |
| `ruff check` / `ruff format --check` | clean |
| `docker compose up --build` | both images build; app on :80 (§4 T7) |

## 2. What changed, per task

### T1 — Repository housekeeping
- `git rev-parse --show-toplevel` = `C:/Data/Projects/SalamYar`, on `main`. `backend/.git` does not exist. No remote is configured, so there was nothing to pull.
- `git ls-files`: no `.env` or `backend/data/*` is tracked.
- B-001 → `Superseded by D-027`. A phase-2 task table was added to `progress.md`.

### T2 — Error codes (D-018, D-019)
- `evaluation_service.submit_evaluation`: a second evaluation → **409 `EVALUATION_LOCKED`** ("Session already evaluated"). The check order is unchanged (B-024).
- 405 `METHOD_NOT_ALLOWED` and 500 `INTERNAL_ERROR` already used the contract shape (B-003 and the phase-1 handler). New tests cover them on the real app: `DELETE /api/v1/agents` → 405; a failing dependency → 500 with no stack trace and no exception text.
- CCR #1 → `accepted — resolved with EVALUATION_LOCKED instead of ALREADY_EVALUATED (D-018)`; CCR #2 → `accepted (D-019)`.

### T3 — Owner-only session endpoints and list order (D-020)
Audit results (B-025):

| Endpoint | Before | After |
|---|---|---|
| `GET /sessions/{id}` | owner **or admin** | owner only |
| `POST /sessions/{id}/messages` | owner **or admin** | owner only |
| `POST /sessions/{id}/finish` | owner **or admin** | owner only |
| `PUT` / `DELETE /messages/{id}/feedback` | owner only (B-019) | unchanged |
| `POST /sessions/{id}/evaluation` | owner only | unchanged |
| `GET /sessions` | caller's own, every role | unchanged (verified) |
| `GET /sessions`, `GET /admin/sessions` order | `created_at` desc | `created_at` desc, then `id` desc |

- `load_accessible` was replaced by `load_owned`. An unknown id still gives 404 before the ownership check.
- An admin who owns a session still gets `reveal` on `GET /sessions/{id}`, because the contract still says "present iff evaluated (or admin)".
- New `tests/test_access.py` (34 tests): 6 endpoints × {owner → success, other evaluator → 403, non-owner admin → 403}. The 403 cases assert that no LLM call is made. Unknown id → 404 for each endpoint (as evaluator and as admin). An admin reading another user's session through `/admin/sessions/{id}` → 200 with `reveal`. Admins' `GET /sessions` returns only their own sessions. Ordering is tested with 3 sequential sessions, and with equal timestamps to exercise the `id` tie-break.
- **Changed existing tests:** `test_sessions.py::test_get_session_access` (admin: 200 with reveal → 403) and `test_admin.py::test_admin_sessions_list_and_detail` (admin `GET /sessions/{id}` on another user's session: 200 with empty feedback → 403).

### T4 — `TurnDecision` accepts a message on conclude (D-024)
- `ask`/`clarify` still require a non-empty `message_to_patient`. On `conclude`, any value is accepted and reset to `""` by the validator, so no code path can show or store it (B-026). The backstage already excluded the key; this is now verified at the API and DB level. `SimpleTurn` is unchanged. The strict-conclude half of B-004 is marked superseded.
- Tests (FakeLLM):
  - a conclude with a farewell parses first time: traces `turn`, `assessment`, both ok, no `repair`; exactly 2 requests (1 turn call + the assessment);
  - an `ask` with an empty message → a `repair` attempt;
  - the stored `turn_backstage` rows and the API backstage have no `message_to_patient`, and the farewell never appears in the messages.

### T5 — Dev server for web integration (D-029)
- `uv run python -m app.dev_server [--db data/dev.db] [--seed] [--delay-ms 1500] [--host] [--port]`. A path that resolves to `data/lab.db` is refused.
- It runs without `.env`: a missing key or `JWT_SECRET` is filled with dev-only placeholders (B-027).
- `--seed` creates `doctor`/`doctor2` (evaluator) and `admin` only when the username is missing. Passwords are never overwritten.
- `--delay-ms`: `asyncio.sleep(N/1000)` per DemoLLM call.
- **«خطا» trigger** (B-028): `LLMRequest` has no session id, so an ASGI wrapper puts the session id from the URL into a contextvar. The key is (session id, transcript hash). The repair attempt is detected by DemoLLM's own invalid-output marker, so both attempts fail → 502. The resend of the same text → 200, and the patient message is reused.
- Start-up banner: URL, absolute DB path, delay, seeded usernames (never passwords).
- `create-user --password-stdin`: reads the first stdin line, strips the line ending and a BOM, and applies the same rules (B-029).
- Tests (`tests/test_dev_server.py`, 12 tests):
  - defaults (`data/dev.db`, 1500 ms) and refusal of `lab.db`;
  - `build_app` applies the DB and the delay;
  - the banner shows usernames but not passwords;
  - seeding twice leaves 3 users with unchanged hashes, and an existing user's password is preserved;
  - the delay is applied (patched `asyncio.sleep`, awaited with `1.5`);
  - the trigger for both architectures: 502 contract body, 2 failed attempts traced, session still active, the resend → 200 with a single patient message;
  - the trigger fires per session;
  - `--password-stdin`: success (with a CRLF and BOM input), a 7-character password rejected, a duplicate username rejected.
- Manual run: `uv run python -m app.dev_server --seed` with no `.env` → `POST /api/v1/auth/login` as `doctor` 200, 8 agents, one turn in 1566 ms. A PowerShell 5.1 pipe `"secret123" | … --password-stdin` was verified.

### T6 — Gemini slugs and the real smoke test (D-022, D-025) — **blocked (no key)**
- Step 1 done (B-030). The public `GET https://openrouter.ai/api/v1/models` (464 models, 2026-09-30) contains `google/gemini-3-flash-preview` and `google/gemini-3.1-pro-preview` **exactly**. They are set for `b-gemini3flash`, `a-gemini3flash`, `b-gemini31pro`, and `a-gemini31pro`, each with a `# D-022` YAML comment. The registry test table is updated. All 6 model slugs in `agents.yaml` now exist.
- Steps 2–6 not run: no `backend/.env`, so no `OPENROUTER_API_KEY`. No real calls were made, and USD 0 was spent.
- Step 3 (for the next run): the smoke table already shows, per agent, OK/FAIL for each scripted turn, the repair count, and cost. **It lacks per-turn latency** (only a total). That extension should be done at the start of the smoke-test run.

### T7 — Root `docker-compose.yml`
- Services match `SYSTEM_OVERVIEW §5` (B-031):
  - `backend`: `build: ./backend`, `env_file: ./backend/.env`, `./backend/data:/app/data`, no published port, `restart: unless-stopped`;
  - `web`: `build: ./web`, `80:80`, `API_UPSTREAM=http://backend:8000`, `depends_on: [backend]`, `restart: unless-stopped`.
- Verified with a temporary git-ignored `backend/.env` (dummy key, random 48-hex `JWT_SECRET`). The `.env` and the check-only `backend/data/lab.db` were deleted afterwards. Commands and results:

```text
PS> docker compose up --build -d
 Image salamyar-web Built · Image salamyar-backend Built · Container salamyar-backend-1 Started · Container salamyar-web-1 Started
PS> docker compose ps
backend   running   8000/tcp
web       running   0.0.0.0:80->80/tcp
PS> Invoke-WebRequest http://localhost/                                    # step 2
status=200 type=text/html doctype=<!doctype html>
PS> Invoke-WebRequest http://localhost/api/v1/agents                       # step 3
status=401 {"error":{"code":"UNAUTHORIZED","message":"Missing bearer token"}}
PS> "secret123" | docker compose exec -T backend python -m app.cli create-user ... --password-stdin
ModuleNotFoundError: No module named 'pydantic'                            # system python, not the venv
PS> "secret123" | docker compose exec -T backend uv run python -m app.cli create-user --username qa --display-name "QA" --role evaluator --password-stdin
created evaluator 'qa' (dce13a35-…)                                        # step 4
PS> Invoke-RestMethod -Method Post http://localhost/api/v1/auth/login -Body '{"username":"qa","password":"secret123"}'
login 200: user=qa role=evaluator; GET /agents with token → 8 agents
PS> (wrong password) → 401 {"error":{"code":"UNAUTHORIZED","message":"Invalid username or password"}}
PS> docker compose restart backend                                         # step 5
 Container salamyar-backend-1 Started
login 200: user=qa role=evaluator  (/app/data: lab.db, lab.db-wal, lab.db-shm)
PS> docker compose down                                                    # step 6
 Container … Removed · Network salamyar_default Removed
```

- The documented container command is `"<password>" | docker compose exec -T backend uv run python -m app.cli create-user … --password-stdin`.

### T8 — Docs
- `README.md`: contract v1.1, dev server (options, seed users, «خطا» trigger), `--password-stdin` (PowerShell), Docker Compose with the in-container user command, smoke-test run and fix rules, and git rules.
- `progress.md`, `decisions.md` (B-024 … B-031), CCR file, and this report.

## 3. Smoke-test results (T6 step 6)

**Not run — no `OPENROUTER_API_KEY`.** Current configuration, to be filled by the first run:

| Agent | Model | `output_mode` | Enabled | Run 1 | Run 2 | Repairs | Mean / max turn latency | Cost / conversation |
|---|---|---|---|---|---|---|---|---|
| b-sonnet5 | anthropic/claude-sonnet-5 | json_object | ✓ | not run | not run | – | – | – |
| b-gpt54 | openai/gpt-5.4 | json_object | ✓ | not run | not run | – | – | – |
| b-gemini31pro | google/gemini-3.1-pro-preview | json_object | ✓ | not run | not run | – | – | – |
| b-gpt5mini | openai/gpt-5-mini | json_object | ✓ | not run | not run | – | – | – |
| b-gemini3flash | google/gemini-3-flash-preview | json_object | ✓ | not run | not run | – | – | – |
| b-deepseekv4pro | deepseek/deepseek-v4-pro | json_object | ✓ | not run | not run | – | – | – |
| a-sonnet5 | anthropic/claude-sonnet-5 | json_object | ✓ | not run | not run | – | – | – |
| a-gpt54 | openai/gpt-5.4 | json_object | ✓ | not run | not run | – | – | – |
| a-gemini31pro | google/gemini-3.1-pro-preview | json_object | ✗ | not run | not run | – | – | – |
| a-gpt5mini | openai/gpt-5-mini | json_object | ✗ | not run | not run | – | – | – |
| a-gemini3flash | google/gemini-3-flash-preview | json_object | ✗ | not run | not run | – | – | – |
| a-deepseekv4pro | deepseek/deepseek-v4-pro | json_object | ✗ | not run | not run | – | – | – |

NFR-2 (p50 ≤ 8 s, p90 ≤ 20 s) and the web client's 90 s turn timeout could not be checked against real models. The nginx proxy read timeout (120 s, web-owned) is above the 90 s client timeout, and the backend LLM timeout is 60 s + 1 retry.

## 4. Config changes and reasons

| Change | Agents | Reason | Decision |
|---|---|---|---|
| `model: google/gemini-3-flash` → `google/gemini-3-flash-preview` | b-gemini3flash, a-gemini3flash | Old slug does not exist; the new id is listed exactly in `/models` | D-022, B-030 |
| `model: google/gemini-3.1-pro` → `google/gemini-3.1-pro-preview` | b-gemini31pro, a-gemini31pro | Same | D-022, B-030 |

No `send_temperature`, `output_mode`, or `reasoning_effort` changes and no greeting fallback: they require smoke-test evidence (D-025).

## 5. New backend decisions

| ID | Topic |
|---|---|
| B-024 | Second evaluation → 409 `EVALUATION_LOCKED`; 405/500 now contract codes |
| B-025 | D-020 audit: `load_owned` for GET/messages/finish; list order `created_at` desc, `id` desc; admin-owner still sees `reveal` |
| B-026 | `TurnDecision` conclude message accepted and reset to `""` (B-004 partly superseded) |
| B-027 | Dev server DB (`data/dev.db`, `lab.db` refused), dev env placeholders, seeding, delay |
| B-028 | «خطا» trigger keyed by session id (ASGI contextvar) + transcript hash; repair detected by marker |
| B-029 | `create-user --password-stdin` (strip line ending and BOM; same rules) |
| B-030 | Gemini slugs confirmed; T6 blocked (no key); `/models` metadata observation |
| B-031 | Compose layout; in-container user creation uses `uv run` |

B-001 → superseded by D-027.

## 6. Contract change requests

| # | Topic | Status |
|---|---|---|
| 1 | Code for a second evaluation | accepted — resolved with `EVALUATION_LOCKED` instead of `ALREADY_EVALUATED` (D-018) |
| 2 | Code for HTTP 405 | accepted (D-019) |

No new requests in this phase.

## 7. Known issues and risks

1. **Real models unverified (highest risk).** No smoke test has been run, so JSON validity, repair rate, latency against NFR-2, cost, and provider parameter acceptance are all unknown for every agent. No agent is currently in the "No fix" row, because none has been tested.
2. **`temperature` may be ignored or rejected.** In OpenRouter `/models`, `supported_parameters` for `anthropic/claude-sonnet-5`, `openai/gpt-5.4`, and `openai/gpt-5-mini` does not include `temperature`. With `output_mode: json_object`, OpenRouter normally drops unsupported parameters silently. With `json_schema`, `require_parameters: true` could make routing fail. Per D-025 this is not evidence, so nothing was changed; check it first in the smoke run.
3. **Repair rate and latency.** Every repair adds a full LLM call. For architecture B, a conclusion is at least 2 calls per turn. If real latencies are near NFR-2 limits, structured conclusions with a repair can approach the 60 s LLM timeout or the 90 s client timeout.
4. **Smoke table lacks per-turn latency** (T6 step 3; small change, to be done with the first real run).
5. **Dev-server trigger scope.** The «خطا» check looks only at the last patient message. Pressing "finish" right after a «خطا» message that was never processed also fails once. This is dev-only behavior.
6. **Git index sharing.** One backend commit (T3) briefly included 27 files staged by the web coder, because the index is shared. It was undone immediately with `git reset --soft HEAD~1` and redone with a pathspec. The web coder's staged state was preserved, and no content was lost. All backend commits now use `git commit … -- backend docker-compose.yml`.
7. `app.cli list-agents` without `--config` requires the settings (key and JWT secret) to be present. This is pre-existing and harmless (`--config config/agents.yaml` works without them).

## 8. Next steps

**M2 (integration):**
1. The product owner adds `OPENROUTER_API_KEY` (and `JWT_SECRET`) to `backend/.env`.
2. Backend: extend the smoke table with per-turn latency. Then run `uv run python -m app.cli smoke-test --include-disabled` twice (USD 3 cap), apply only the D-025 rule-table fixes, re-run, and fill §3 of this report.
3. Web phase 3: integrate against `uv run python -m app.dev_server --seed` (409 via `--delay-ms`, 502 via «خطا»), then against the real backend.
4. `docker compose up --build -d` on the target host behind the HTTPS reverse proxy. Create the evaluator accounts with the `--password-stdin` command from the README.

**M3:** onboard the physicians after the smoke test passes for all enabled agents. Watch the admin metrics for the repair rate (`llm_calls.purpose = repair`) and for latency p50/p90 per agent against NFR-2.
