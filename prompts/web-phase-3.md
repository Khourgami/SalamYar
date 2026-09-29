# Web Phase 3 — Integration with the Real Backend

**Start only after** backend phase 2 and web phase 2 are both complete and committed (D-028).

You are a **senior frontend engineer** specialized in **API integration and end-to-end testing** (React 18, TypeScript strict, TanStack Query, Vitest, headless Chrome). You continue the `web/` project of the AI Triage Agent Lab. Until now the app ran only against MSW mocks. In this phase you connect it to the real backend, prove that every contract path works, and fix any drift on the web side.

## 1. Read first, in this order

1. `web/AGENTS.md`
2. `docs/decisions.md` (D-018 … D-029), `docs/API_CONTRACT.md` v1.1, `docs/SYSTEM_OVERVIEW.md` (§4 local development, §7 integration checklist)
3. `web/docs/UI_SPEC.md` v1.1, `web/docs/DESIGN_SYSTEM.md`
4. `web/docs/decisions.md`, `web/docs/progress.md`, `web/docs/reports/phase-2-design-system.md`
5. `backend/README.md` and `backend/docs/reports/phase-2-integration-readiness.md` — **read only**, to learn how to run the backend dev server and what it supports

## 2. Rules

- **Boundary.** Write only inside `web/`. You may **run** commands in `backend/` (start the dev server, create users) and `docker compose` at the root, but never edit any file outside `web/`.
- **Contract is the referee.** When the backend and the contract disagree, do **not** loosen the web types or add a silent workaround. Record the case in `web/docs/contract-questions.md` as a row marked `backend-issue`, with the request, the actual response, and the contract section, and keep the web code faithful to the contract. When the web app is wrong, fix it with a test.
- **No new features, copy, or visual changes** beyond fixes required for integration.
- **Cost.** Use the backend **dev server** (DemoLLM, no API cost) for everything except T5. In T5, send at most **2 real patient messages** in total.
- **Git (D-027).** Stage only web paths from inside `web/` (`git add -- .`), commit prefix `web:`, at least one commit per task; if `.git/index.lock` exists, wait and retry, never delete it. Never commit `.env`.
- **Per-task loop:** implement → tests → `npm run build`, `npm run lint`, `npm run test` green → update `web/docs/progress.md` and `web/docs/decisions.md` → commit.

## 3. Tasks

### T1 — Environment

- Start the backend dev server in its own terminal, from `backend/`: `uv run python -m app.dev_server --seed` (confirm the exact command and port in `backend/README.md`). It seeds `doctor`/`doctor123`, `doctor2`/`doctor123`, and `admin`/`admin123` into `data/dev.db`, simulates a delay per LLM call, and fails a turn once when the patient text contains «خطا» (D-029).
- In `web/.env` (gitignored): `VITE_USE_MOCKS=false`. If the dev server is not on port 8000, make the Vite proxy target configurable with `VITE_API_PROXY_TARGET` (default `http://localhost:8000`), document it in `.env.example` and the README, and record a `W-xxx` decision.
- Add a "Phase 3" task table (T1–T6) to `web/docs/progress.md`.

**Done when:** `npm run dev` with mocks off logs in as `doctor` through the Vite proxy.
**Tests:** none new (if you add `VITE_API_PROXY_TARGET`, a unit test of the config helper).

### T2 — Contract conformance suite

Create `src/integration/` with a Vitest **node-environment** suite run by a new script `npm run test:int`, excluded from `npm run test`. Base URL from `INTEGRATION_API_URL` (default `http://localhost:8000/api/v1`). Every test creates its own sessions; never assume an empty database.

- A helper `expectExactKeys(obj, required, optional = [])` that fails on missing required keys **and** on unknown keys. Write the key lists by hand from `API_CONTRACT.md §2` for: `User`, `AgentPublic`, `Message`, `SessionSummary`, `SessionDetail`, `TurnResponse`, `ResultCard` (+ `stats`), `AssessmentResult`, `ClinicalSummary`, `Hypothesis`, `CantMiss`, `GuardReport`, `BackstageTurn` (all keys optional), `Feedback`, `Evaluation`, `AgentReveal` (+ `config`), `MetricsRow`, and the error body. Also check enum values against the runtime lists in `@/api/types`.
- Scenarios (one test each):
  1. Login success (key set) and wrong password → 401 error shape; `GET /auth/me`.
  2. `GET /agents`: key set, no model/architecture fields, same order on two calls.
  3. Create a session: status `active`, exactly one `greeting` message.
  4. Chat to completion with one agent whose id starts with `a-` and one with `b-` (ids are opaque to the UI, but tests may use them): at most 15 patient messages; the result arrives; `result` and `backstage` are non-null; every `BackstageTurn.message_id` is an agent message of the session; `final_triage_level` in the summary equals `result.guard.final_triage_level`.
  5. `POST /finish` on an active session → `result`, `end_reason: "evaluator_ended"`, `patient_message: null`.
  6. Two concurrent `POST /messages` on one session → one 200 and one 409 `TURN_IN_PROGRESS`.
  7. A message containing «خطا» → 502 `AGENT_ERROR` with `patient_message` and `agent_message` (kind `error`); the session stays active; resending the identical text → 200 and the transcript has one copy of that patient message.
  8. Feedback: PUT, PUT again (update), DELETE, DELETE again (204); on a `greeting` → 400; as `doctor2` and as `admin` → 403.
  9. Evaluation: a body missing `comparison` → 400; a valid body → 201; the session now has `evaluation` and `reveal`; a second POST → 409 `EVALUATION_LOCKED`; feedback PUT and DELETE → 409 `EVALUATION_LOCKED`.
  10. Comparison: evaluate a second completed session with `comparison` pointing to the first → 201; pointing to itself → 400.
  11. Ownership: `GET /sessions/{id}` of doctor's session as `doctor2` → 403, as `admin` → 403, unknown id → 404; `GET /admin/sessions/{id}` as admin → 200 with `reveal`; as `doctor` → 403.
  12. Lists: `GET /sessions` newest first with `total`; `evaluated=false` filter; `GET /admin/sessions` items have `user` and `agent_reveal`.
  13. `GET /admin/metrics` for each `group_by`: `group_by` echoed, every row matches `MetricsRow` keys.
  14. `GET /admin/export/{table}.csv` for all 6 tables: 200, `text/csv`, the body starts with the UTF-8 BOM.
  15. `POST /admin/agents/reload` → `{loaded, enabled}` numbers.

**Done when:** `npm run test:int` passes against the dev server, or every failure is a `backend-issue` row with evidence.
**Tests:** this task is the tests.

### T3 — Browser end-to-end pass

With the dev server and `npm run dev` (mocks off), in headless Chrome as in phases 1–2, at **1280 px and 375 px**:

1. `doctor`: log in → pick a doctor → chat to completion (typing bubble visible, input disabled during the turn) → result card and backstage render sanely (no raw `[object Object]`, no empty headings) → feedback on a message → evaluation form: submit empty (errors + focus), then complete and submit → summary and reveal.
2. Another doctor ended with `پایان گفتگو و دریافت نتیجه` (confirm dialog).
3. «خطا» message → error bubble → `ارسال دوباره` → the turn succeeds with no duplicated patient bubble.
4. 409: open the same active session in two tabs, send from both → the 409 toast appears and the text is restored.
5. 401: replace the stored token with garbage → the next request redirects to `/login`.
6. 403: as `doctor2`, open doctor's session URL → «دسترسی ندارید».
7. `admin`: dashboard (cards, chart, recent sessions, table, group-by), a CSV download, the reload toast, `/admin/sessions` filters, and a session detail with reveal and read-only feedback.
8. Blindness probe: fetch the real agent ids and model slugs through the admin API, then check that none of them (nor `simple`/`structured`) appears in the DOM of `/`, an active chat, a completed-unevaluated session, and `/history`.

Save one screenshot per step at each width in `web/docs/reports/phase-3-screenshots/`.

**Done when:** every step passes, or each failure is fixed (web side) or recorded as a `backend-issue`.
**Tests:** for every web-side bug found here, first add a failing unit/component test with MSW that reproduces it, then fix it.

### T4 — Fix web-side drift

Fix everything T2 and T3 found on the web side (types, parsing, formatting of real timestamps and nulls, empty-array rendering, long-text overflow from real content). Update the MSW fixtures where the real backend showed a more realistic shape **that is still contract-valid** (for example real `BackstageTurn` fields), so the mocks keep matching reality.

**Done when:** `npm run test`, `npm run test:int`, build, and lint are green.
**Tests:** one regression test per fix.

### T5 — Docker Compose smoke (real backend)

Precondition: `backend/.env` exists with a real key (the product owner creates it). If it is missing, mark T5 `blocked` and skip it.

1. From the root: `docker compose up --build -d`.
2. Create an evaluator inside the backend container with the `--password-stdin` command documented in `backend/README.md`.
3. At `http://localhost/`: log in, see the doctors list, start one session, send **one** patient message, and confirm that a real agent reply arrives (note the latency). Optionally one more message. Nothing else — this costs real money.
4. `docker compose down`.

**Done when:** the reply arrives through nginx, or the failure is reported with logs (`docker compose logs web backend`).
**Tests:** none automated.

### T6 — Docs and phase report

- README: mock vs real mode, `test:int`, `VITE_API_PROXY_TARGET` if added.
- Update `web/docs/progress.md`, `web/docs/decisions.md`, and `web/docs/contract-questions.md`.
- Write **`web/docs/reports/phase-3-integration.md`** in English: summary; environment; T2 results per scenario (pass/fail); T3 results per step and width; every fix with its regression test; all `backend-issue` rows with evidence; the T5 result and observed real latency; known issues; recommendations for the M2 integration report.

**Done when:** the report is written and everything is committed.

## 4. Definition of done (phase)

- `npm run test:int` passes against the backend dev server (or each failure is a documented `backend-issue`).
- The full browser flow works at 1280 and 375 px, including the 401, 403, 409, and 502 + resend paths.
- No blindness leak against the real agent ids and models.
- The app runs through `docker compose` against a real model (or T5 is explicitly blocked).
- Build, lint, unit tests, integration tests green; docs, report, and screenshots committed with `web:` prefixes.
