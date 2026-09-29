# Phase 1 — Web App against Mocks

**Date:** 2026-09-29
**Scope:** `web/` only — the `AGENTS.md` boundary was respected; nothing outside `web/` was created or edited.
**Stack:** React 18.3, TypeScript 5.7 (strict), Vite 6, Tailwind CSS 3, TanStack Query 5, React Router 6, MSW 2, Vitest 3 + React Testing Library, Vazirmatn, RTL/Persian.
**Status:** ✅ Complete — `npm run build`, `npm run lint` and `npm run test` (128 tests) are green, and `docker build -t triage-web .` succeeds.

---

## 1. Summary

Phase 1 delivers the whole Persian (RTL) frontend of the AI Triage Agent Lab, built entirely against
**MSW mocks** that follow the frozen `../../docs/API_CONTRACT.md` v1. A physician can log in, pick a
blind "virtual doctor", role-play a patient in a chat until the agent concludes, read the result card
and the backstage reasoning, submit an evaluation — and only then see the reveal. An admin gets a
comparison dashboard, the full session list, a per-session detail view, and CSV exports.

Everything the contract specifies is implemented and type-mirrored: no endpoint, field or enum was
invented. The app never displays an agent `id`, model or architecture before evaluation — verified in
a real browser, not just in tests.

The phase ended with a real-browser, 375 px QA pass that **found and fixed a bug that no jsdom test
could have caught** (a missing MSW service worker left the app blank; see §5).

---

## 2. What was built, per task

### T1 — Scaffold
Vite + React 18 + TypeScript strict project, Tailwind 3 with Vazirmatn (400/500/700) as the default
sans font, `<html lang="fa" dir="rtl">`, dev server on 5173 with `/api` → `localhost:8000`, Vitest
(jsdom + jest-dom), ESLint 9 flat config, `.env.example`, README, and a smoke test for `<App/>`.
Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`, `test`, `test:watch`.

### T2 — API types and client
- `src/api/types.ts` mirrors `API_CONTRACT.md` §2–§7 exactly (field names and enum values), and also
  exports the runtime enum lists (`TRIAGE_LEVELS`, `SPECIALTIES`, `CONFIDENCE_LEVELS`,
  `CANT_MISS_STATUSES`, `GUARD_FLAGS`, `GUARD_ACTIONS`, `END_REASONS`, `ARCHITECTURES`,
  `SESSION_STATUSES`, `COMPARISON_WINNERS`, `EXPORT_TABLES`, `METRICS_GROUP_BY`,
  `EVALUATION_SCORE_KEYS`, `SAFETY_FLAG_KEYS`) so the label tests can iterate the contract instead of
  a hand-written list.
- `src/api/client.ts`: `apiFetch`/`apiFetchRaw`, `Authorization: Bearer` from `triage_lab_token`,
  JSON parsing, `ApiError {status, code, message, body}` with the **full** body preserved (needed for
  the 502 `AGENT_ERROR` payload) plus an `agentErrorBody` accessor, 30 s default timeout and **90 s**
  for `POST /sessions/{id}/messages` and `/finish`, `ApiError {status: 0, code: 'NETWORK_ERROR'}` on
  timeout, and `401` → clear token + user + `location.assign('/login')` from every endpoint except
  login.
- `src/api/endpoints.ts`: one typed function per contract endpoint (auth, agents, sessions, messages,
  finish, feedback PUT/DELETE, evaluation, admin sessions, admin metrics, export URL builder, reload).
  CSV export goes through `apiFetchRaw` + a Blob because it needs the auth header, and is saved as
  `<table>.csv`.

### T3 — MSW mocks
`src/mocks/` implements **every** endpoint on a stateful in-memory store that is resettable:
- 2 users (`doctor`/`doctor123` → evaluator «دکتر آزمایشی», `admin`/`admin123` → admin «مدیر»),
  opaque tokens `mock-token-<username>`; wrong credentials return the contract 401 body.
- 8 blind agents (`دکتر ۱` … `دکتر ۸`) with hidden reveals; the `a-`/`b-` prefix drives the
  architecture, the model slug is arbitrary.
- Conversation: the exact `GREETING_FA` from `AGENT_SPEC.md §2.3`, a 3–6 s delay per turn (0 in
  tests), a rotating list of 4 Persian follow-ups, and conclusion with a full result card on the 5th
  patient message or on `POST /finish`.
- The word `خطا` in a patient message returns the 502 `AGENT_ERROR` body verbatim.
- Backstage: structured fields for `b-` agents, `reasoning_note` only for `a-` agents.
- Agent `b-gpt54` produces `guard.actions: ['safety_floor_escalation']` with
  `raw_triage_level: URGENT_24H` → `final_triage_level: EMERGENCY_NOW`, so the escalation UI is
  visible out of the box.
- Fixtures: a realistic completed structured session (abdominal pain, elderly woman) with 3
  differential items, 3 can't-miss items with different statuses, missing information and a clinical
  summary; an already-evaluated session with a `reveal`; and an active session. Three stable ids are
  exported as `FIXTURE_SESSION_IDS`.
- Contract rules enforced: `EVALUATION_LOCKED` after evaluation, `SESSION_NOT_COMPLETED`,
  `TURN_IN_PROGRESS`, resend-reuse, admin 403s; `/admin/metrics` answers all 3 `group_by` values;
  export returns a small CSV with a BOM; reload returns `{loaded: 12, enabled: 8}`.

### T4 — i18n and formatting
`src/i18n/labels.ts` + `specialties.ts` hold exhaustive Persian label maps (triage levels and colors,
confidence, can't-miss statuses and colors, guard flags/actions, end reasons, architectures, session
statuses, comparison winners, backstage enums, the 9 KPI labels with their 1/3/5 anchors, safety
flags). `src/i18n/uiText.ts` is the single home of static Persian copy, verbatim from `UI_SPEC.md`,
with ZWNJ written as `\u200c`. `src/lib/format.ts` adds `faNumber`, `faDecimal`, `faPercent`,
`faPercentValue`, `usd` (4 decimals), `faDateTime` (Jalali `fa-IR`), `faDuration`, `faLatency`,
`truncate` and `EMPTY_VALUE`.

### T5 — App shell, auth, login
Auth context storing token + user in `triage_lab_token`/`triage_lab_user`, with one
`clearStoredAuth()` path that notifies `AuthProvider` so a 401 also drops the in-memory session and
the query cache. Route guards (`RequireAuth`, `RequireAdmin` → «دسترسی ندارید»), the persistent
banner, the header with role-dependent links, the login page, and the seven routes of `UI_SPEC §2`.
Query client: `retry: false` for mutations, `retry: 1` for queries.

### T6 — Virtual doctors list (`/`)
A responsive grid of the 8 blind doctors with one shared `Stethoscope` avatar, `شروع گفتگو` →
`POST /sessions` → navigate to the session, plus loading skeleton, empty state and the blindness hint.
No agent `id`, model or architecture ever reaches the DOM.

### T7 — Session page: chat
Bubbles for patient/agent, auto-scroll to the newest message, Enter sends / Shift+Enter newlines, the
input and send button disabled during a turn with the «پزشک در حال بررسی…» typing bubble, and the
questions counter. Per-message 👍/👎 + inline note on `question` and `result` messages (clicking the
active rating again calls `DELETE`), read-only after evaluation. `پایان گفتگو و دریافت نتیجه` behind a
confirm dialog. The 502 body is folded into the transcript with an `ارسال دوباره` resend that does not
duplicate the message; the 409 `TURN_IN_PROGRESS` shows the §4 toast and restores the rejected text.
`TurnResponse.session` is written straight into the `['session', id]` cache, so a completed session
switches to the completed view without a reload.

### T8 — Result card and backstage
`TriageBadge` (colors per `UI_SPEC §7.1`), the safety-floor note derived from `guard.actions`, the
emergency probability bar, specialty and secondary specialty, confidence, the differential table with
`name_en` in small gray LTR text, the can't-miss table with status colors, missing information, the 7
clinical-summary blocks, guard-flag chips, 4 stats and the pediatric note. Wide tables scroll
horizontally instead of overflowing the page. The backstage panel is a collapsible timeline (open by
default) with one item per `BackstageTurn`, titled with the text of the related agent message, and a
generic renderer for whatever fields are present — including `clinical_state` as nested key/value
lists inside a collapsible «پرونده بالینی». **No branch on architecture.**

### T9 — Evaluation form and reveal
The 9 KPI radio groups with anchors under 1/3/5, the optional 0–50 unnecessary-questions number, the
5 safety checkboxes, the verdict (triage select, specialty select with Persian labels, main diagnosis),
the 4 comment textareas, and the comparison block. Hand-written validation marks every missing
required field with «لطفاً این مورد را کامل کنید» and scrolls the first one into view. Submitting
`POST /sessions/{id}/evaluation` refetches the session and swaps the form for the read-only answers,
then the reveal box (architecture, model, configuration) and `گفتگو با پزشک دیگر`. The comparison
select lists only the user's **other completed** sessions with the display name, a 40-character
preview of the first message and the date.

### T10 — My sessions (`/history`)
The 6 exact columns of `UI_SPEC §3.4`, rows clickable by mouse and keyboard, and the `همه` /
`ارزیابی‌نشده` tabs (`evaluated=false` is part of the query key, so switching refetches) with
`keepPreviousData` so the table does not flash a skeleton.

### T11 — Admin pages
- **Dashboard:** `group_by` switch (agent / architecture / model) that refetches, a sortable table
  with all **20** metadata columns and `aria-sort`, rates as Persian percentages, scores to one
  decimal, latency, USD cost, and under-triage > 0 in red; 6 export buttons that download a Blob named
  `<table>.csv`; a reload button whose result lands in a toast with Persian digits.
- **Admin sessions:** the list with agent, user and evaluated filters.
- **Admin session detail:** `SessionContent` reused read-only with the reveal always shown and every
  user's feedback.

### T12 — Packaging and QA
- `Dockerfile`: `node:20-alpine` (`npm ci`, then `tsc -b && vite build` with `VITE_USE_MOCKS=false`) →
  `nginx:1.27-alpine` serving `dist/`, with a healthcheck. The MSW worker is deleted from the image.
- `nginx.conf`: SPA fallback to `index.html`, immutable caching for `/assets/`, `no-store` for
  `index.html`, and `/api/` proxied to the backend with a **120 s** read timeout.
- `.dockerignore` keeps `node_modules`, `dist`, `.env*`, tests and repo furniture out of the context.
- README updated (Docker, env, mock mode, layout, tests).
- Real-browser QA pass at 375 px (§5).

---

## 3. Test results

`npm run test` — **14 files, 128 tests, all passing.**

| File | Tests | Covers |
|---|---|---|
| `src/lib/format.test.ts` | 14 | Persian digits, percent, Jalali date/time, USD, duration, latency, truncate |
| `src/i18n/labels.test.ts` | 9 | every enum value has a label, KPI anchors, safety flags |
| `src/api/client.test.ts` | 15 | auth header, `ApiError` + 502 body kept, timeout → `NETWORK_ERROR`, 401 clears the token, long timeout on turns |
| `src/api/endpoints.test.ts` | 8 | one test per endpoint group + query parameters + CSV download |
| `src/mocks/handlers.test.ts` | 25 | login success/failure, conclusion on the 5th message, `خطا` → 502, reveal only after evaluation, 409/400/403/404 paths, admin metrics/exports/reload |
| `src/App.test.tsx` | 1 | `<App/>` renders |
| `src/app/shell.test.tsx` | 12 | login flow, guard redirects, evaluator blocked from `/admin*`, banner on every page, logout |
| `src/pages/DoctorsPage.test.tsx` | 5 | cards render, start → create session → navigate, no agent id in the DOM, empty + error states |
| `src/components/session/ChatPanel.test.tsx` | 10 | send → typing → reply, disabled during a turn, Shift+Enter, 409 toast + text restore, completed view without a reload, 502 + resend without duplication, finish confirm, feedback toggle + note |
| `src/components/session/ResultCard.test.tsx` | 4 | card with and without the safety-floor escalation, missing optional fields, pediatric override |
| `src/components/session/BackstagePanel.test.tsx` | 4 | structured fields for `b-`, reasoning note only for `a-`, nested clinical record, missing fields |
| `src/components/session/EvaluationForm.test.tsx` | 7 | every block renders, validation blocks submit and marks all required fields, error clears when filled, submit → read-only + reveal, reveal absent before submit, comparison lists only other completed sessions |
| `src/pages/HistoryPage.test.tsx` | 4 | rows, columns, tab filtering, row navigation |
| `src/pages/AdminPages.test.tsx` | 10 | metrics columns + sorting, group-by refetch, CSV download per button, reload toast, admin session list filters, detail with reveal, evaluator blocked |

Cumulative by task: T1 1 → T2 24 → T3 49 → T4 72 → T5 84 → T6 89 → T7 99 → T8 107 → T9 114 →
T10 118 → T11 128 → T12 128.

`npm run build` — 0 TypeScript errors (`tsc -b` strict, `noUnusedLocals`, `verbatimModuleSyntax`).
`npm run lint` — clean.

---

## 4. Packaging verification

| Check | Result |
|---|---|
| `docker build -t triage-web .` | ✅ succeeds (74.7 MB) |
| `npm run build` inside the image | ✅ (a type error fails the build) |
| `docker run` without a backend | ✅ container starts and stays healthy |
| `GET /` | ✅ 200 `text/html`, `<title>آزمایشگاه پزشک مجازی</title>` |
| `GET /history` (deep link) | ✅ 200 — SPA fallback works |
| `GET /api/v1/agents` with no backend | ✅ 502 (proxy is live, not a config error) |
| `GET /api/v1/agents` with a container named `backend` on the same network | ✅ 200 with the backend body, path preserved |
| `mockServiceWorker.js` inside the image | ✅ absent (production artifact never mocks) |
| `nginx -t` after entrypoint substitution | ✅ `${API_UPSTREAM}` substituted, nginx's own `$uri` untouched |

---

## 5. Manual QA — real browser, 375 px

Run against `npm run dev` (MSW on) in headless Chrome driven over the DevTools protocol at a 375 × 812
viewport with mobile emulation, with a horizontal-overflow probe on every route (elements escaping the
viewport are ignored only when an ancestor legitimately scrolls or clips them).

**Login through MSW in a real browser:** `200`, `mock-token-doctor`, role `evaluator` — the browser
worker genuinely intercepts, it is not only the jsdom `msw/node` path.

| Route | Page overflow | Content |
|---|---|---|
| `/login` | none (scrollWidth 375) | rendered |
| `/` doctors list | none | rendered |
| `/sessions/{active}` chat | none | rendered |
| `/sessions/{completed, unevaluated}` result card + form | none | rendered |
| `/sessions/{evaluated}` + reveal | none | rendered |
| `/history` | none | rendered |
| `/admin` dashboard | none | rendered |
| `/admin/sessions` | none | rendered |
| `/admin/sessions/{evaluated}` detail | none | rendered |

Extra checks in the same browser:

- **Blindness:** on `/`, the active chat, the completed-but-unevaluated session and `/history`, the DOM
  contains **none** of the 8 agent ids, none of the 6 model slugs, and not the words `structured` /
  `simple`. On the evaluated session the reveal is present (`openai/gpt-5.4`).
- **Chat round-trip:** sending a message shows the «در حال بررسی» typing bubble, disables the input,
  and completes the turn a few seconds later against the mocks.

### Bug found and fixed

The QA pass surfaced a defect that every jsdom test missed, because the tests run `msw/node` and never
touch the browser worker:

1. `public/mockServiceWorker.js` had **never been generated** (there was no `public/` directory).
2. `/mockServiceWorker.js` therefore fell through to the SPA fallback and was served as `text/html`.
3. Service-worker registration failed (`unsupported MIME type 'text/html'`).
4. `enableMocking()` rejected, so the `.then()` that mounts React never ran — **the app rendered a
   blank page** in the documented default configuration (`VITE_USE_MOCKS=true`).

Fixes (`W-023`): the worker is now committed (`npx msw init public/ --save`, recorded as
`msw.workerDirectory` in `package.json`), and `main.tsx` wraps `worker.start()` in a `try/catch` that
logs the failure and renders the app anyway, so a mock problem can never again blank the UI. Both were
re-verified in the browser.

---

## 6. `W-xxx` decisions

All are recorded with rationale in `docs/decisions.md`; the table summarises them.

| ID | Decision |
|---|---|
| W-001 | Pin `vite@^6` with `vitest@^3` (vitest 2 bundles vite 5 → duplicate `Plugin` types break `tsc -b`) |
| W-002 | A local, gitignored `.env` (`VITE_USE_MOCKS=true`) ships next to the committed `.env.example` |
| W-003 | One strict root `tsconfig.json` instead of project references, keeping the `tsc -b` script |
| W-004 | `@/*` → `src/*` alias declared in both tsconfig and Vite |
| W-005 | No git repository exists in the workspace, so no `web:` commits were possible |
| W-006 | `ApiError` keeps the full JSON body (+ `agentErrorBody`); timeouts throw `status: 0` / `NETWORK_ERROR` |
| W-007 | `login()` opts out of the 401 handler (a failed login is not an expired session) |
| W-008 | CSV export via `apiFetchRaw` + Blob, because it needs the auth header |
| W-009 | MSW handlers use the wildcard origin `*/api/v1` so one set serves the browser and node |
| W-010 | The mock turn delay is configurable: 3–6 s in the browser, 0 in tests |
| W-011 | A test-only fetch bridge drops `RequestInit.signal` (undici rejects a jsdom-realm `AbortSignal`) |
| W-012 | All mock agents have `description: null` (inventing copy risks hinting at the model) |
| W-013 | Exhaustive `Record<Enum, …>` label maps plus runtime enum lists in `@/api/types` |
| W-014 | `src/i18n/uiText.ts` is the only home of static Persian copy; invented strings are flagged in-file |
| W-015 | `clearStoredAuth()` dispatches `triage-lab:auth-cleared`; `AuthProvider` clears the query cache |
| W-016 | The router opts into the React Router v7 future flags |
| W-017 | Backstage renders generically per `BackstageTurn`; never branches on architecture |
| W-018 | `keepPreviousData` for the history tabs and the metrics group-by switch |
| W-019 | The CSV test helper stubs `createObjectURL` on a `URL` **subclass** (MSW and Router need the real `URL`) |
| W-020 | `adminReloadToast(loaded, enabled)` takes pre-formatted Persian-digit strings |
| W-021 | Evaluation controls carry `id="field-<key>"` and the first invalid field is scrolled into view |
| W-022 | The admin session detail reuses `SessionContent` read-only with the reveal always shown |
| W-023 | The MSW worker is committed and a worker failure can no longer blank the app |
| W-024 | nginx resolves the API upstream per request, so a cold backend cannot stop the container booting |
| W-025 | `API_UPSTREAM` overrides the upstream at run time via the nginx template + `NGINX_ENVSUBST_FILTER` |
| W-026 | The image build deletes `dist/mockServiceWorker.js` |
| W-027 | The invented Persian strings added in T9–T11 are marked `invented` in `uiText.ts` |

---

## 7. Open contract questions

Recorded in `docs/contract-questions.md` (all still **open**; each has a conservative assumption in
force, so nothing is blocked):

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q-1 | `UI_SPEC §2` grants `/history` to both roles, but the contract returns only the current user's sessions. Does an admin's «سوابق من» list only their own sessions? | `/history` always uses `GET /sessions`; the admin's full list lives on `/admin/sessions` |
| Q-2 | The contract says feedback is for "agent messages only" but does not say whether an admin may rate another user's session, nor whose feedback feeds the sessional score | Any user with access rates their **own** feedback; the admin detail shows all feedback read-only; metrics count all rows |
| Q-3 | `SessionSummary.final_triage_level` does not state the raw-vs-final distinction from the guard | The final (post-guard) level is shown everywhere |
| Q-4 | The backstage mini hypothesis table needs a `name_fa`/`name_en`/`probability` projection; the spec says "name + %" only | `name_fa` with a small gray `name_en` and a Persian percentage, matching the differential table |

---

## 8. Known issues

1. **Dead MSW chunk in `dist/`.** `browser-*.js` (≈328 kB) is still emitted even with
   `VITE_USE_MOCKS=false`, because Rollup creates a chunk for every dynamic import before minification
   can drop the unreachable branch. It is never *requested* at runtime (the guard is inlined as a
   constant, so the import never runs), so it costs build size, not user bytes. Cleanest phase-2 fix:
   alias `@/mocks/browser` to an empty module when mocks are disabled.
2. **Browser mocks depend on `public/mockServiceWorker.js`.** It is committed and self-healing in the
   sense that the app now renders without it, but mocks then silently do not work. `npx msw init
   public/ --save` must be re-run whenever `msw` is upgraded.
3. **Mock state is per page load.** A hard reload resets sessions, evaluations and feedback created
   during a demo. Only the seeded fixtures survive.
4. **Query `retry: 1`.** Deliberate, but error states appear one round-trip later than they would
   otherwise (tests account for it with longer `findBy` timeouts).
5. **No automated accessibility audit.** Semantics were written by hand (roles, labels, `aria-sort`,
   native radios/checkboxes, keyboard-activatable rows) but no axe/Lighthouse pass has been run.
6. **Persian copy has a small invented surface.** Everything with a `UI_SPEC` source is verbatim;
   the handful of headings, the comparison-select label and the reload toast are flagged as
   `invented` in `uiText.ts` (`W-014`, `W-027`) and should be confirmed by the product owner.
7. **No git history.** The workspace has no repository, so the requested `web:` commits could not be
   made (`W-005`); progress is tracked in `docs/progress.md`.
8. **Docker daemon.** `docker build` was verified after starting the local Docker Desktop daemon;
   the build itself requires a reachable engine.

---

## 9. Recommended next steps (backend integration)

1. **Switch to the real API.** Set `VITE_API_BASE_URL=/api/v1` and `VITE_USE_MOCKS=false`; with the
   container, set `API_UPSTREAM`. No code change is needed — the client and all types already mirror
   the frozen contract.
2. **Validate real payloads once.** The client trusts the contract at the type level only. Worth a
   smoke pass over the real responses for the pieces most likely to drift: `guard.actions` values,
   every `BackstageTurn` variant (the panel renders generically, so a new field should be checked to
   look sane rather than to crash), `created_at` timestamps (Jalali rendering assumes ISO with a
   timezone), and `MetricsRow` nullability per `group_by`.
3. **Confirm the 90 s turn budget.** The client allows 90 s for a turn and nginx reads for 120 s;
   verify real model latency stays inside that, or raise both together.
4. **Close Q-1…Q-4** before the metrics are trusted: which sessions `/history` returns for an admin,
   feedback ownership and its weight in the sessional score, `final_triage_level` semantics, and the
   backstage mini-table projection.
5. **Consider generating `types.ts` from the backend's OpenAPI schema** if one is produced, so the
   mirror cannot drift. If a turn ever becomes streamed (`text/event-stream`), that is a contract
   change and the chat panel will need a streaming state.
6. **Decide how "other completed sessions" is served** for the comparison select. The UI currently
   derives it from `GET /sessions`; if a user accumulates many sessions, a filtered list endpoint
   would be better.
7. **Drop or keep the demo fixtures deliberately.** The seeded sessions and the `خطا`/`safety_floor`
   triggers are mock-only affordances for demonstrating the UI; they are useful for a staging demo and
   should not be mistaken for real data.
8. **Harden the deployment** for anything beyond the PoC: security headers and a CSP in nginx, an
   nginx access/error log policy, and HTTPS termination.
