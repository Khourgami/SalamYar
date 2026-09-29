# Web Progress

Updated by the web coder at the end of every task.

## Current status

**Phase 1 — Web app against mocks.** ✅ Complete (all of T1–T12 done, build + lint + 128 tests green, image builds).
See `docs/reports/phase-1-web-mock.md`.

| Task | Scope | Status |
|---|---|---|
| T1 | Scaffold (Vite + React 18 + TS strict + Tailwind 3 + Vitest/RTL), scripts, env, README | ✅ Done |
| T2 | `src/api/types.ts` + `client.ts` (`apiFetch`, timeout, 401 handling) + `endpoints.ts` | ✅ Done |
| T3 | MSW mocks: handlers, in-memory store, fixtures, browser worker + handler tests | ✅ Done |
| T4 | i18n Persian label maps (`labels.ts`, `specialties.ts`) + `lib/format.ts` + tests | ✅ Done |
| T5 | App shell, auth context, route guards, login page + tests | ✅ Done |
| T6 | Virtual doctors list (`/`) + tests | ✅ Done |
| T7 | Session page chat state (send/typing/disabled, feedback, finish, 502/409) + tests | ✅ Done |
| T8 | Result card + generic backstage panel + tests | ✅ Done |
| T9 | Evaluation form, validation, reveal + tests | ✅ Done |
| T10 | My sessions (`/history`) table + tabs + tests | ✅ Done |
| T11 | Admin dashboard, admin sessions list and detail + tests | ✅ Done |
| T12 | Dockerfile, nginx.conf, `.dockerignore`, mobile QA, phase report | ✅ Done |

**Phase 2 — Design system and contract v1.1 (on mocks).** 🚧 In progress.

| Task | Scope | Status |
|---|---|---|
| T1 | Housekeeping + contract v1.1 (types, mocks, UI behavior, dead MSW chunk) | ✅ Done |
| T2 | Design tokens (`DESIGN_SYSTEM §1–§3`) + UI primitives (`src/components/ui/`) | ✅ Done |
| T3 | App shell: sidebar/drawer, sticky test banner, logo mark | ✅ Done |
| T4 | Login page redesign (`§6.1`) | ✅ Done |
| T5 | Doctors list redesign (`§6.2`) | ✅ Done |
| T6 | Session page chat restyle (`§6.3`, `§5.11`) | ⬜ Not started |
| T7 | Result card, backstage, evaluation, reveal (`§6.4–§6.6`) | ⬜ Not started |
| T8 | History and admin (`§6.7–§6.9`, UI_SPEC §3.5) | ⬜ Not started |
| T9 | QA, contrast script, screenshots, phase-2 report | ⬜ Not started |

### Environment note

The repository now exists at the project root (`git rev-parse --show-toplevel` = the project root)
and all commits use the `web:` prefix, staging only `web/` paths (D-027). `W-005` is superseded.

## Verification per task

Every task is checked with:

```
npm run build   # tsc -b && vite build — zero TypeScript errors
npm run lint    # eslint .
npm run test    # vitest run
```

## Log

- 2026-09-30 — **Phase 2** — T5 — Doctors list on the primitives: responsive 1/2/3/4-column grid, one identical 56px neutral avatar per card (`data-testid="doctor-avatar"`), `display_name` as `h3`, optional `description` caption, a full-width secondary `شروع گفتگو` with a loading state while every other button is disabled, the hint in an info `Alert`, and no specialty text or per-agent avatar. `build` ✅ `lint` ✅ `test` ✅ (161 tests, +2). Next: T6 chat restyle.
- 2026-09-30 — **Phase 2** — T4 — Login redesign: a two-column desktop layout (form card max 400px on the inline-start side, `primary-100` brand panel with the 64px logo, the app name and the UI_SPEC §3.1 line on the inline-end side) that collapses to one column on mobile; `TextField`/`PasswordField`/`Button` primitives; the error as a danger `Alert` with focus moved to the username field; no forgot-password. Added `LOGIN_TITLE`/`LOGIN_BRAND_LINE` to `uiText` (UI_SPEC §3.1) and made `TextField` forward its ref. **Changed test:** `App.test.tsx` “renders the application shell” now uses `getAllByText` (the login page shows the app name twice). `build` ✅ `lint` ✅ `test` ✅ (159 tests, +2). Next: T5 doctors list.
- 2026-09-30 — **Phase 2** — T3 — Rebuilt the shell: `LogoMark` (§4.4 inline SVG), `SidebarNav` (shared by the ≥1024px sidebar and the mobile drawer, role-gated UI_SPEC §2 items, `aria-current="page"` via `NavLink`, display name + `خروج`), `MobileTopBar` (56px, `منو` button) and `Drawer` (focus trap, Escape/overlay/navigation close, focus back to the menu button). `TopBanner` is now the sticky, non-closable §4.3 banner on tokens; `AppLayout` wires the sidebar + content column; `Header.tsx` is removed. `build` ✅ `lint` ✅ `test` ✅ (157 tests, +6). Next: T4 login page.
- 2026-09-30 — **Phase 2** — T2 — Added the §2 CSS variables, the §3 Tailwind mapping (colours, radius, shadow, `fontSize` styles), base styles (canvas, font stack, `:focus-visible` ring), the `.icon-dir` RTL mirror, `.overlay-scrim` and a `prefers-reduced-motion` rule; added Vazirmatn 600. Built the primitives in `src/components/ui/`: `Button` (4 variants, 2 sizes, loading/`aria-busy`), `TextField`, `PasswordField` (show/hide), `TextArea`, `Select`, `Card`, `Badge`, `Alert`, `Modal` (focus trap), `Toast`, `Skeleton`, `SegmentedControl` (group/tabs/radios), `SegmentedRating` (native radios + 1/3/5 anchors). `ConfirmDialog` now uses `Modal`+`Button`; `Toast`/`Skeleton` moved to `ui/`. `build` ✅ `lint` ✅ `test` ✅ (151 tests, +10). Next: T3 app shell.
- 2026-09-30 — **Phase 2** — T1 — Housekeeping (W-005 → Superseded by D-027; Phase-2 table; Q-1…Q-4 answered). Contract v1.1: `ApiErrorCode` + `API_ERROR_CODES` add `METHOD_NOT_ALLOWED`/`INTERNAL_ERROR`; mocks add user `doctor2`/«دکتر آزمایشی ۲», make every §5/§6 endpoint owner-only for **every** role (admin included, 404 before 403), enforce the feedback check order (404→403→400 kind→409) with an idempotent `DELETE`, validate the evaluation body strictly **before** the state checks, and keep both lists newest-first. UI: a 403 on `/sessions/:id` renders the full-page «دسترسی ندارید» state with a link to `/`; a 409 `EVALUATION_LOCKED` on submit shows the §4 toast (hoisted to `SessionContent`) and refetches; the evaluation form already sent every key. Build: `@/mocks/browser` is aliased to an empty stub and `copyPublicDir` is off when `VITE_USE_MOCKS≠true`, proven by `scripts/check-no-msw.mjs`. `build` ✅ `lint` ✅ `test` ✅ (141 tests, +13). Next: T2 tokens and primitives.
- 2026-09-29 — T1 — Scaffolded the Vite + React 18 + TypeScript (strict) project, Tailwind 3 with
  Vazirmatn (400/500/700), RTL `index.html`, dev proxy `/api` → :8000, Vitest (jsdom + jest-dom),
  ESLint 9 flat config, `.env.example`, README, and a smoke test for `<App/>`.
  `build` ✅ `lint` ✅ `test` ✅ (1 test). Next: T2 API types and client.
- 2026-09-29 — T2 — `src/api/types.ts` (every contract type plus runtime enum lists), `client.ts`
  (`apiFetch`/`apiFetchRaw`, `ApiError` with the full body, 30 s/90 s timeouts, `401 → logout +
  /login` unless the call opted out) and `endpoints.ts` (one function per endpoint, CSV export via
  `fetch` + Blob). `build` ✅ `lint` ✅ `test` ✅ (24 tests). Next: T3 MSW mocks.
- 2026-09-29 — T3 — MSW mocks: `data.ts` (2 users, 8 blind agents + hidden reveals, the exact
  Persian greeting/disclaimer/error texts), `fixtures.ts` (abdominal-pain assessment, generic
  backstage builder, 3 seeded sessions incl. an evaluated one with reveal), `model.ts`,
  `store.ts` (stateful, resettable), `handlers.ts` (every contract endpoint), `browser.ts`,
  `server.ts`, plus the Vitest MSW harness. `build` ✅ `lint` ✅ `test` ✅ (49 tests total).
  Next: T4 Persian label maps and formatting.
- 2026-09-29 — T4 — `src/i18n/labels.ts` (triage levels + colors, confidence, can't-miss statuses +
  colors, guard flags/actions, end reasons, architectures, session statuses, comparison winners,
  backstage enums, KPI labels with the 1/3/5 anchors, safety flags), `src/i18n/specialties.ts`
  (AGENT_SPEC §2.2) and `src/i18n/uiText.ts` (all static Persian copy, ZWNJ written as `\u200c`).
  `src/lib/format.ts` adds `faNumber`/`faDecimal`/`faPercent`/`faDateTime`/`faDuration`/`faLatency`/
  `usd`/`truncate`. `build` ✅ `lint` ✅ `test` ✅ (72 tests). Next: T5 shell + auth.
- 2026-09-29 — T5 — Auth context (token + user in `triage_lab_token`/`triage_lab_user`, a single
  `clearStoredAuth` path that notifies `AuthProvider`), route guards (`RequireAuth`,
  `RequireAdmin` → «دسترسی ندارید»), `AppLayout` (persistent banner + header + outlet), the login
  page, and the TanStack Query client (`retry: false` for mutations, `retry: 1` for queries).
  `build` ✅ `lint` ✅ `test` ✅ (84 tests). Next: T6 doctors list.
- 2026-09-29 — T6 — `/` renders the 8 blind doctor cards from `GET /agents` with a shared
  `Stethoscope` avatar, `شروع گفتگو` → `POST /sessions` → navigate, plus the loading skeleton, the
  empty state and the hint. No agent id, model or architecture reaches the DOM.
  `build` ✅ `lint` ✅ `test` ✅ (89 tests). Next: T7 chat state.
- 2026-09-29 — T7 — `/sessions/:id` loads the session into `["session", id]`; the chat panel sends
  with Enter (Shift+Enter newlines), disables input + send during a turn, shows the «پزشک در حال
  بررسی…» typing bubble, auto-scrolls, shows the questions counter, escapes the text before
  render, writes `TurnResponse.session` straight into the cache (completed view without a reload),
  folds the 502 body into the transcript with `ارسال دوباره`, toasts the 409 text and restores the
  rejected text, and confirms `پایان گفتگو و دریافت نتیجه` with a dialog. Per-message 👍/👎 + note
  use `PUT`/`DELETE` and become read-only after evaluation.
  `build` ✅ `lint` ✅ `test` ✅ (99 tests). Next: T8 result card + backstage.
- 2026-09-29 — T8 — `TriageBadge` (colored per §7.1), the full result card (badge, safety-floor
  note, probability bar, specialty/confidence, differential table with `name_en`, can't-miss table
  with status colors, missing information, clinical-summary blocks, guard-flag chips, stats,
  pediatric note) and the generic backstage panel (collapsible timeline open by default, one item
  per `BackstageTurn` titled with the related agent message, structured fields, nested
  collapsible «پرونده بالینی», no architecture branching). Wide tables scroll horizontally.
  `build` ✅ `lint` ✅ `test` ✅ (107 tests). Next: T9 evaluation form + reveal.
- 2026-09-29 — T9 — Part C of the session page: `EvaluationForm` (9 KPI radio groups with the 1/3/5
  anchors, the optional 0–50 unnecessary-questions number, the 5 safety checkboxes, the verdict
  triage/specialty selects + main diagnosis, the 4 comment textareas, and the comparison block
  whose select lists only the user's *other* completed sessions with a 40-character first-message
  preview and the date). Hand-written validation marks every missing required field with
  «لطفاً این مورد را کامل کنید» and scrolls to the first one; `POST /sessions/{id}/evaluation` then
  refetches and swaps the form for `EvaluationSummary` + `RevealBox` (architecture, model,
  configuration) and the `گفتگو با پزشک دیگر` link. The reveal is unreachable before submission.
  `build` ✅ `lint` ✅ `test` ✅ (114 tests). Next: T10 history.
- 2026-09-29 — T10 — `/history`: the 6 exact columns of §3.4, keyboard-clickable rows into the
  session, and the `همه` / `ارزیابی‌نشده` tabs (`evaluated=false` in the query key, so switching
  tabs refetches) with `placeholderData: keepPreviousData` to avoid a skeleton flash.
  `build` ✅ `lint` ✅ `test` ✅ (118 tests). Next: T11 admin.
- 2026-09-29 — T11 — Admin area: `MetricsTable` (all 20 metric columns of §3.5, sortable with
  `aria-sort`, rates as percentages, scores to 1 decimal, latency, USD, under-triage > 0 in red),
  the dashboard with the `group_by` switch, the 6 CSV export buttons (Blob download named
  `<table>.csv`) and the agent-reload toast; the admin sessions list with agent/user/evaluated
  filters; and the admin session detail that reuses `SessionContent` read-only with the reveal
  always shown and every user's feedback. `build` ✅ `lint` ✅ `test` ✅ (128 tests, after the
  `/history` heading assertion was switched to `findByRole`). Next: T12 packaging.
- 2026-09-29 — T12 — `Dockerfile` (node:20-alpine `npm ci` + `tsc -b && vite build` with
  `VITE_USE_MOCKS=false` → nginx:1.27-alpine), `nginx.conf` (SPA fallback, `/api/` → `$API_UPSTREAM`
  with 120 s read timeout, runtime DNS so a cold backend cannot stop the container from booting),
  `.dockerignore`, README refresh, and a real-browser 375 px QA pass.
  **Bug found and fixed by that pass:** `public/mockServiceWorker.js` had never been generated, so
  `/mockServiceWorker.js` fell through to the SPA fallback and was served as `text/html`; the
  service-worker registration then failed, `enableMocking()` rejected, and the app rendered a
  **blank page** — a failure every jsdom test missed because they use `msw/node`. Fixed with
  `npx msw init public/ --save` plus a `try/catch` in `main.tsx` so a mock failure can never blank
  the app. Verified in headless Chrome: MSW login `200 mock-token-doctor`, all 9 routes render with
  zero horizontal overflow at 375 px, no agent id / model / architecture anywhere in the DOM before
  evaluation, reveal present after evaluation, and a full chat turn (typing bubble + disabled input
  + reply) round-trips against the mocks. `docker build -t triage-web .` ✅ (74.7 MB, mock worker
  stripped from the image).
  `build` ✅ `lint` ✅ `test` ✅ (128 tests). **Phase 1 complete.**
