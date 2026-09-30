# Web Phase 3 — Integration with the Real Backend

**Date:** 2026-09-30 · **Status:** complete except T5, which is **blocked** (no `backend/.env` /
`OPENROUTER_API_KEY`). No real model call was made and USD 0 was spent.

## 1. Summary

The web app now runs against the real backend and every contract path is verified:

- **T2 — contract conformance suite** (`npm run test:int`, node environment): **35/35 tests pass**
  against `uv run python -m app.dev_server --seed --delay-ms 800`. All fifteen scenarios pass with
  no contract discrepancy: every key set, enum, HTTP status and error code matched
  `API_CONTRACT.md` v1.1. No `backend-issue` row was needed.
- **T3 — browser end-to-end pass** (`scripts/qa-browser-phase3.mjs`, headless Chrome over CDP):
  **60/60 checks pass at 1280 px and 375 px**, no console errors, no blindness leak. 24 screenshots
  in `docs/reports/phase-3-screenshots/`.
- **T4 — drift**: no web-side bug and no contract drift was found by T2 or T3. One realism
  alignment was made: the MSW backstage now emits a `BackstageTurn` for the concluding `result`
  message, as the real backend does (W-043).
- **T5 — docker compose smoke**: blocked (no key).

## 2. Environment

| Piece | Value |
|---|---|
| Backend dev server | `uv run python -m app.dev_server --seed --delay-ms 800` from `backend/` — offline `DemoLLM`, no cost (D-029), seeded `doctor`/`doctor2`/`admin` |
| Web dev server | `VITE_USE_MOCKS=false` (`web/.env`), Vite proxying `/api` to `http://localhost:8000` |
| Integration base URL | `INTEGRATION_API_URL` (default `http://localhost:8000/api/v1`) |
| Browser | headless Chrome over the DevTools Protocol, 1280×800 and 375×812 |

`VITE_API_PROXY_TARGET` was added (W-041) so the Vite proxy target is configurable without editing
`vite.config.ts`; it defaults to `http://localhost:8000`. The `test:int` suite lives outside the
jsdom run (`vitest.integration.config.ts`, `src/integration/**`, excluded from `npm run test`) so
the fast unit suite never needs a running server.

Verification: `npm run build` ✅ · `npm run lint` ✅ · `npm run test` ✅ (180) · `npm run test:int` ✅
(35).

## 3. T2 — contract conformance, per scenario

`src/integration/`: `helpers.ts` (`request`, `expectExactKeys`, hand-written key sets from
`API_CONTRACT §2`, composite validators, session/evaluation helpers) + six spec files.

| # | Scenario | Where | Result |
|---|---|---|---|
| 1 | Login success key set; wrong password → 401 `UNAUTHORIZED`; `GET /auth/me` | `auth-agents.test.ts` | ✅ |
| 2 | `GET /agents` key set, no model/architecture fields, same order twice | `auth-agents.test.ts` | ✅ |
| 3 | `POST /sessions` → `active`, exactly one `greeting` | `sessions.test.ts` | ✅ |
| 4 | Chat to completion, one `a-` and one `b-` agent (≤15 messages); result + backstage non-null; every `BackstageTurn.message_id` is an agent message; `final_triage_level` = `result.guard.final_triage_level` | `sessions.test.ts` | ✅ |
| 5 | `POST /finish` → result, `evaluator_ended`, `patient_message: null` | `sessions.test.ts` | ✅ |
| 6 | Two concurrent messages → one 200, one 409 `TURN_IN_PROGRESS` | `sessions.test.ts` | ✅ |
| 7 | «خطا» → 502 `AGENT_ERROR` with both messages (`kind: error`); stays active; resend identical text → 200 and one copy | `sessions.test.ts` | ✅ |
| 8 | Feedback PUT/PUT/DELETE/DELETE(204); greeting → 400; doctor2/admin → 403 | `feedback-evaluation.test.ts` | ✅ |
| 9 | Evaluation missing `comparison` → 400; valid → 201; reveal present; second → 409 `EVALUATION_LOCKED`; feedback PUT/DELETE → 409 | `feedback-evaluation.test.ts` | ✅ |
| 10 | Comparison to another completed session → 201; to itself → 400 | `feedback-evaluation.test.ts` | ✅ |
| 11 | `GET /sessions/{id}` as doctor2 → 403, as admin → 403, unknown → 404; `GET /admin/sessions/{id}` as admin → 200 with reveal, as doctor → 403 | `access.test.ts` | ✅ |
| 12 | `GET /sessions` newest-first with `total`; `evaluated=false`; `GET /admin/sessions` items have `user` + `agent_reveal` | `lists.test.ts` | ✅ |
| 13 | `GET /admin/metrics` for each `group_by` echoed; rows match `MetricsRow` | `admin.test.ts` | ✅ |
| 14 | `GET /admin/export/{table}.csv` for all 6 tables: 200, `text/csv`, UTF-8 BOM | `admin.test.ts` | ✅ |
| 15 | `POST /admin/agents/reload` → numeric `loaded`/`enabled` | `admin.test.ts` | ✅ |

Additional enum checks: triage levels, specialties, confidence, can't-miss statuses, guard
flags/actions, end reasons, session statuses, comparison winners, metric score/flag keys — all
against the runtime lists in `@/api/types`.

## 4. T3 — browser end-to-end, per step and width

| Step | 1280 px | 375 px |
|---|---|---|
| 1 doctor login → doctor → chat to completion (typing + disabled input) → result/backstage sanity (no `[object Object]`, no empty headings, no `undefined`) → feedback → evaluation empty submit (11 errors + focus) → complete submit → summary + reveal | ✅ | ✅ |
| 2 another doctor ended with `پایان گفتگو و دریافت نتیجه` + confirm dialog | ✅ | ✅ |
| 3 «خطا» → error bubble with `ارسال دوباره` → resend succeeds, one patient bubble | ✅ | ✅ |
| 4 two tabs on one active session → 409 toast + restored text | ✅ | ✅ |
| 5 garbage token → `/login` | ✅ | ✅ |
| 6 doctor2 on doctor's session → «دسترسی ندارید» | ✅ | ✅ |
| 7 admin dashboard (4 cards, chart, recent sessions, table, group-by), CSV download, reload toast, `/admin/sessions` filters, detail reveal + read-only feedback | ✅ | ✅ |
| 8 blindness: 16 real needles (agent ids + model slugs + `simple`/`structured`) × 4 routes (/, active chat, completed-unevaluated, /history) | ✅ no leak | ✅ no leak |

## 5. Fixes and regression tests

**T3 found no web-side bug.** The first run of the harness failed on its own bugs, not the app:
`localStorage` was touched on `about:blank` (fixed by navigating first), step 3 asserted a UI error
title that `UI_SPEC` does not require, and step 7 clicked the newest admin row (an active session
with no reveal) — fixed by filtering to evaluated sessions. None of these changed `src/`.

**T4** (no drift found): the mocks' `buildBackstage` stopped at the last question, while the real
backend returns a `BackstageTurn` for the concluding `result` message too (observed: a simple
session → 3 turns for 2 questions + the conclusion; structured → `next_action: "conclude"`,
`stop_reason: "enough_information"`, `question_rationale: ""`). `buildBackstage` now emits one turn
per agent turn, `completeSession` appends the result message before building the backstage, and
`BackstagePanel.test.tsx` gained the concluding-turn regression test (counts updated 4→5 and 3→4).
See W-043.

## 6. `backend-issue` rows

**None.** Every T2 assertion passed against the dev server. Two things were verified explicitly
before concluding:

- the CSV export **does** start with a UTF-8 BOM (`xxd`: `ef bb bf`) — the initial failure was a
  web-side test bug (`Response.text()` strips the BOM), fixed in the helper (W-042);
- the 502 `agent_message.text` is the same Persian string the mocks use
  (`متأسفانه در پردازش پیام مشکلی پیش آمد. لطفاً پیام خود را دوباره ارسال کنید.`), so the error
  bubble needs no web change.

## 7. T5 — docker compose smoke

**Blocked.** `backend/.env` does not exist, so there is no real `OPENROUTER_API_KEY` and no
evaluator can be created for a real-model run. Per the task, T5 is marked blocked and skipped; no
`docker compose up` with real models was performed and no cost incurred.

## 8. Known issues

1. **T5 unverified against a real model.** The nginx → backend → OpenRouter path and real latency
   remain untested end-to-end (see the backend phase-2 report, which is also blocked there).
2. **`backend/data/dev.db` accumulates.** Every T2/T3 run creates sessions in `data/dev.db`; they
   are harmless but the file grows. Delete `backend/data/dev.db` to reset.
3. **The dev-server «خطا» trigger is one-shot per (session, transcript)** and only inspects the
   last patient message (backend known issue 5); T2/T3 always use a fresh session.
4. **Blindness probe scope.** It checks the DOM of four routes for enabled agent ids and model
   slugs fetched live; disabled agents are not in `GET /agents`, so they are not needles.
5. **`CHAT_ERROR_TITLE` is unused.** The constant exists in `uiText.ts` but `UI_SPEC §3.3` renders
   only the backend message text, so the bubble does not show a title. Left as dead copy rather
   than inventing UI; flagging for cleanup in M2.

## 9. Recommendations for the M2 integration report

- Run T5 once `backend/.env` exists; record the observed first-reply latency and the
  `mean_turn_latency_ms` from the result card against NFR-2.
- Re-run `npm run test:int` against the real backend (not just the dev server) as the M2 entry
  check; the suite is host-agnostic via `INTEGRATION_API_URL`.
- Keep `scripts/qa-browser-phase3.mjs` in CI-adjacent use for regression before each physician
  cohort: it is dependency-free and exercises all four error paths plus the blindness probe.
- Consider extending the blindness probe to the result card and backstage text, not only the
  outerHTML of the four routes.
