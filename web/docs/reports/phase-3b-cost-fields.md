# Web Phase 3b — Contract v1.2: Tokens and Cost

**Date:** 2026-09-30 · **Status:** T1–T4 complete (unit + handler tests, build, lint green). **T5 is
blocked** — backend phase 2c is not implemented yet, so the real API still serves contract v1.1
(see §5). No real model call was made and USD 0 was spent.

## 1. Summary

Contract v1.2 (D-035, D-039, D-007) adds token/call accounting to the result card, five new columns
to the admin metrics table, and a slow-turn caption to the typing bubble. Cost, tokens and call
count must stay invisible to an evaluator until the session is evaluated, because they hint at the
model tier and the architecture.

Delivered:

- `ResultCard.stats` and `MetricsRow` mirror the v1.2 contract exactly (`src/api/types.ts`).
- The MSW mocks mask the five hidden stats for a non-admin caller until evaluation, and always
  expose them to an admin; one metrics row in four is left `null` so the empty-value and null-sort
  paths are exercised.
- The result card renders the five new stats **only when the value is a number** — no `—`, no empty
  label, so the pre-evaluation DOM never reveals that a hidden value exists.
- The admin metrics table gains the five sortable columns (`null` sorts last, renders `—`).
- The typing bubble adds «پاسخ ممکن است تا یک دقیقه طول بکشد.» after 15 s (D-039).

Verification: `npm run build` ✅ · `npm run lint` ✅ · `npm run test` ✅ (**190**, was 180, +10) ·
`npm run test:int` ⛔ blocked (backend v1.1, §5).

## 2. Changes per task

### T1 — Types and mocks

- **`src/api/types.ts`** — `ResultCard.stats` gains `llm_calls`, `prompt_tokens`,
  `completion_tokens`, `reasoning_tokens` (all `number | null`) and `total_cost_usd` becomes
  nullable in the v1.2 order; `MetricsRow` gains `total_cost_usd`, `mean_llm_calls`,
  `mean_prompt_tokens`, `mean_completion_tokens`, `mean_reasoning_tokens`.
- **`src/mocks/model.ts`** — new `resultFor(session, viewer)` masks exactly the five hidden stats
  to `null` unless the session is evaluated or the viewer is an admin; `toDetail` uses it, so the
  hidden values never leave the mock boundary (W-044).
- **`src/mocks/fixtures.ts`** — `buildResultCard` fills the four new stats deterministically
  (`llm_calls = questions + 3`, prompt/completion/reasoning token totals).
- **`src/mocks/handlers.ts`** — `plausibleRow` fills the five new columns; every fourth row is
  `null` (so `/admin/metrics` has a `null` row in every grouping).
- **`src/integration/helpers.ts`** — `KEYS.ResultStats` and `KEYS.MetricsRow` updated;
  `expectResultCard` validates the five nullable numbers; `src/integration/admin.test.ts` validates
  the six nullable cost/token columns.

### T2 — Result card stats

- **`src/i18n/uiText.ts`** — «هزینه» (was «هزینه (دلار)»), «تعداد فراخوانی مدل»، «توکن ورودی»،
  «توکن خروجی»، «توکن استدلال» (UI_SPEC v1.2 §3.3, verbatim).
- **`src/lib/format.ts`** — `faInteger` (Persian digits + thousands separator, rounds) for the
  counts and token totals; `usd` (4 decimals) for the cost.
- **`src/components/session/ResultCard.tsx`** — the three base stats plus the five v1.2 stats,
  each appended **only when `typeof value === 'number'`** (W-044).

### T3 — Admin metrics table

- **`src/i18n/uiText.ts`** — «هزینه کل»، «میانگین فراخوانی مدل»، «میانگین توکن ورودی»،
  «میانگین توکن خروجی»، «میانگین توکن استدلال».
- **`src/components/admin/MetricsTable.tsx`** — the five new columns, in the §3.5 order, after
  `میانگین هزینه`. `total_cost_usd`/`mean_cost_usd` use `usd`; the four means use `faDecimal(…, 1)`.
  Sorting reuses the existing comparator, so `null` always sorts last and renders the existing `—`.

### T4 — Slow-turn hint (D-039)

- **`src/i18n/uiText.ts`** — `CHAT_SLOW_TURN` («پاسخ ممکن است تا یک دقیقه طول بکشد.», UI_SPEC v1.2).
- **`src/components/session/ChatPanel.tsx`** — one `useEffect` keyed on `busy` restarts a 15 s timer
  for every turn and clears the caption when the turn ends (success, error or timeout). The caption
  is rendered inside the typing bubble, whose «پزشک در حال بررسی…» text is unchanged (W-046).

## 3. Tests (before → after)

| Suite | Before | After |
|---|---|---|
| `npm run test` (jsdom) | 180 | **190** (+10) |

New tests:

- `src/mocks/handlers.test.ts` — the three base stats stay visible; the five hidden stats are `null`
  for an evaluator before evaluation and numbers after; an admin always gets numbers; the metrics
  rows carry the five new columns with at least one `null`.
- `src/components/session/ResultCard.test.tsx` — blindness probe: none of the five labels, no
  formatted cost and no `$` before evaluation; all five render with the correct Persian formatting
  after evaluation; the admin detail shows them for an unevaluated session.
- `src/pages/AdminPages.test.tsx` — the five headers render; sorting by «هزینه کل» puts the `null`
  row last.
- `src/components/session/SlowTurnHint.test.tsx` (new, fake timers) — the caption is inside the
  bubble with the unchanged typing text, hidden at 14.9 s, shown at 15 s, gone after the reply, and
  hidden again at the start of the next turn.

The browser blindness probes were extended (W-045): `scripts/qa-browser-phase3.mjs` and
`scripts/qa-browser.mjs` now also forbid the five stat labels, and both scan the app root for a
formatted `$` amount (root-only so Vite's injected dev scripts cannot produce a false positive).

## 4. Decisions

- **W-044** — the hidden stats are masked at the mock response boundary and the card renders a stat
  only when `typeof value === 'number'`.
- **W-045** — the browser blindness probe forbids the five v1.2 labels and a `$` amount, scanned on
  the app root only.
- **W-046** — the slow-turn caption is driven by a single `busy`-keyed effect (no second timer per
  mutation), and lives inside the typing bubble.

## 5. Integration and browser results — BLOCKED

The phase spec says to start after **backend phase 2c is complete and committed**. It is not:

- `git log` has no phase-2c commit (latest backend commit is `7aba1e6 backend: phase 2b T5/T6`), and
  there is no `backend/docs/reports/phase-2c-cost-accounting.md`.
- The uncommitted `docs/API_CONTRACT.md` / `docs/decisions.md` carry the v1.2 changelog, but the
  backend code does not implement it: `app/schemas/api.py::ResultStats` still has four fields, and
  `app/services/metrics_service.py::MetricsRow` has no cost/token columns.
- The dev server already running on `:8000` was probed read-only and answers with the **v1.1**
  surface:
  - `GET /admin/metrics` row keys: `…, mean_cost_usd, feedback_up, feedback_down, pairwise,
    safety_floor_escalations` — none of the five v1.2 columns.
  - `GET /sessions/{id}` result `stats`: `questions_asked, duration_seconds, total_cost_usd,
    mean_turn_latency_ms` — none of the four new stats, and `total_cost_usd` is `0` (not `null`) on
    an unevaluated session.
- Running the updated `test:int` against it fails as expected:

  ```
  expectExactKeys → ResultCard.stats: missing keys llm_calls, prompt_tokens,
  completion_tokens, reasoning_tokens
  v1.2 scenario: unevaluated ResultCard.stats.total_cost_usd: expected null, received 0
  ```

Because the shared dev server was started by another thread and its database is shared, the suite
was **not** driven to completion and no browser pass was run against it (both would only report the
missing backend surface). T5.1 and T5.2 are therefore deferred until backend 2c lands; the updated
key sets and the new `v1.2` scenario in `src/integration/sessions.test.ts` are ready to run then.

What could still be verified locally: `build`, `lint`, the full jsdom suite (190) and the node
syntax of both browser scripts.

## 6. Known issues

1. **T5 blocked** — no backend v1.2 surface on the running dev server (§5). The web side is ready.
2. `reasoning_tokens`/`total_cost_usd` are allowed to stay `null` after evaluation when no call
   reported them; the integration scenario and the result card both treat that as "hidden", not as
   an error. The dev server's `DemoLLM` reports `cost 0` and `reasoning null`, which is why the
   masked/unmasked assertion accepts either for those two fields.
3. `npm run test:int` is now strictly v1.2: it will fail against any v1.1 backend by design.

## 7. Next steps

1. Land backend phase 2c, then run `npm run test:int` (expect 36/36 incl. the new scenario) and the
   two browser passes at 1280/375 px (`--delay-ms 16000` for the slow-turn hint).
2. Re-run the extended blindness probes and record the screenshots under
   `docs/reports/phase-3b-screenshots/`.
