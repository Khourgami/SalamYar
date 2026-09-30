# Phase 2 — Design system and contract v1.1 (on mocks)

**Date:** 2026-09-30 · **Scope:** `web/` only · **Against:** MSW mocks (no real backend)
**Baseline:** phase 1 complete (128 tests, build/lint green, Docker image builds).

---

## 1. Summary

Phase 2 applies the new visual design (`DESIGN_SYSTEM.md`) and the contract v1.1 changes
(`API_CONTRACT.md`) to the existing React app, entirely against the MSW mocks.

- **Contract v1.1** is implemented in the mocks and honoured by the UI: owner-only session
  endpoints (admin included), 404 before 403, 409 `EVALUATION_LOCKED` on a second evaluation,
  strict evaluation-body validation before the state checks, the feedback check order
  (404 → 403 → 400 → 409) with an idempotent `DELETE`, newest-first lists, and the new
  `METHOD_NOT_ALLOWED` / `INTERNAL_ERROR` error codes in the type mirror.
- **The design system** lives in `src/index.css` (§2 variables, the only hex in `src/`) and
  `tailwind.config.js` (§3 mapping). Every page was restyled onto the token primitives in
  `src/components/ui/`; no default-palette class and no hex survives outside the token files.
- **Verification:** 176 unit/component tests (from 128), `npm run build` + `npm run lint` green,
  `VITE_USE_MOCKS=false` build proven MSW-free by `scripts/check-no-msw.mjs`,
  `docker build -t triage-web .` succeeds (75.5 MB), a WCAG contrast script over 69 token pairs
  passes with 0 failures, and a real-browser CDP QA pass runs **107 checks across five
  viewports with 0 failures**.

## 2. What changed per task

### T1 — Housekeeping and contract v1.1 (`717c88a`)
- `src/api/types.ts`: `ApiErrorCode` union + runtime `API_ERROR_CODES` (adds
  `METHOD_NOT_ALLOWED`, `INTERNAL_ERROR`; `NETWORK_ERROR` for the client-side timeout).
- Mocks: user `doctor2`/«دکتر آزمایشی ۲»; `isOwner` makes every §5/§6 session endpoint
  owner-only for **every** role (404 before 403); second evaluation → 409 `EVALUATION_LOCKED`;
  `hasExactKeys` strict evaluation validation (every key, nullable ones as `null`,
  `comparison` must reference another completed session of the same user) **before** the state
  checks; feedback PUT/DELETE in the contract order with idempotent 204; both lists newest-first.
- UI: 403 on `/sessions/:id` → full-page «دسترسی ندارید» with a link to `/` (W-031);
  409 → the §4 toast + session refetch, hoisted to `SessionContent` (W-032).
- Dead MSW chunk: `vite.config.ts` aliases `@/mocks/browser` → an empty stub and drops
  `copyPublicDir` when `VITE_USE_MOCKS ≠ true`; `scripts/check-no-msw.mjs` proves `dist/`
  carries no MSW reference (W-029). Docs: W-005 superseded, Q-1…Q-4 answered, phase-2 table.

### T2 — Tokens and UI primitives (`efd696b`)
- `src/index.css`: all §2 variables, base styles (canvas, font stack, `:focus-visible` ring),
  `.icon-dir`, `.overlay-scrim` (W-033), `prefers-reduced-motion`. `tailwind.config.js`: §3
  mapping (colours, radii, shadows, named `fontSize`).
- New `src/components/ui/`: `Button` (4 variants, 2 sizes, loading/`aria-busy`), `TextField`
  (forwardRef, `aria-invalid`/`aria-describedby`), `PasswordField` (show/hide), `TextArea`,
  `Select`, `Card`, `Badge`, `Alert`, `Modal` (focus trap, Escape, focus return), `Toast`,
  `Skeleton`, `SegmentedControl` (group/tabs/radios modes, W-035), `SegmentedRating` (§5.10
  native radios, 1/3/5 anchors, accessible digit W-034), `MetricCard`, `cn.ts`, barrel.
  `ConfirmDialog` rebuilt on `Modal`+`Button`; `Toast`/`Skeleton` moved to `ui/` (W-036).

### T3 — App shell (`75e629b`)
- `LogoMark` (§4.4 inline SVG heart+pulse), `SidebarNav` (shared sidebar/drawer content,
  UI_SPEC §2 items role-gated, `aria-current="page"`, display name + «خروج»), `MobileTopBar`
  (56 px, «منو» 44×44), `Drawer` (focus trap; closes on Escape/overlay/navigation; focus
  returns). `AppLayout` rebuilt (248 px `bg-primary-900` sidebar ≥1024 px, top bar + drawer
  below); `TopBanner` is the sticky non-closable §4.3 banner; `Header.tsx` deleted (W-037).

### T4 — Login page (`30d56e5`)
- Two-column desktop layout (form card ≤400 px + `primary-100` brand panel with the 64 px
  logo, display title, §3.1 line), one column on mobile; `TextField`/`PasswordField`/lg
  `Button`; the error as a danger `Alert`; focus moves to the username field after a failed
  login; no forgot-password. Added `LOGIN_TITLE`/`LOGIN_BRAND_LINE` (UI_SPEC §3.1).

### T5 — Doctors list (`30cd658`)
- 1/2/3/4-column grid, one identical 56 px `primary-100` avatar per card
  (`data-testid="doctor-avatar"`), `display_name` as `h3`, optional `description` caption,
  full-width secondary «شروع گفتگو» with a loading state that disables every other button,
  the hint in an info `Alert`. No specialty text, no per-agent avatar.

### T6 — Session chat (`3e063a4`)
- Session header card (back link with the mirrored chevron, avatar + `h2` name, status chip
  `data-testid="session-status"`, question counter, secondary finish button), bubbles per §5.11
  (agent surface `rounded-ss-sm`, patient `primary-100` `rounded-se-sm`, error `neutral-100`
  with «ارسال دوباره», `faTime` captions), typing bubble (animated dots + `sr-only` text),
  32 px feedback toggles, sticky auto-growing composer (1–5 lines, `env(safe-area-inset-bottom)`,
  «ارسال» with `aria-label` when icon-only). `faTime` added to `lib/format.ts`.

### T7 — Result, backstage, evaluation, reveal (`7402d8c`)
- `TriageBadge` on `Badge` with the §1.2 tones (`ROUTINE_DAYS` now **blue**) and per-level
  icons (icon only at `lg`). `ResultCard`: emergency → danger `Alert` (`emergency-alert`) whose
  title is the lg badge; otherwise the badge + optional warning safety-floor note; §6.4
  probability-bar thresholds; token tables; clinical-summary grid; guard chips; pediatric note.
- `BackstagePanel`: `Card` with a 2px rail timeline, generic renderer unchanged (W-017), mini
  hypothesis table (`name_fa` + small `name_en` + Persian %).
- `EvaluationForm`: `SegmentedRating` × 9 KPIs (no stars), the safety-flag warning box,
  winner `SegmentedControl`, `focusField()` scrolls **and focuses** the first invalid control.

### T8 — History and admin (`0364b10`)
- `/history`: `SegmentedControl mode="tabs"` (`role="tablist"`), `sm` triage badges, evaluated
  chips, token table with hover.
- `/admin`: group-by control, reload button, 4 exact-sum `MetricCard`s, `TriageRatesChart`
  (recharts grouped bars, 3 series, `dir="ltr"` wrapper, `role="img"` + Persian `aria-label`,
  null-safe), recent-sessions card (`GET /admin/sessions?limit=5`, ≤5 rows, «مشاهده همه»),
  the phase-1 metrics table, the CSV card. `/admin/sessions` + detail restyled; under-triage > 0
  in `text-danger-700`. Added `recharts@^2.15` and a `ResizeObserver` stub for jsdom (W-039).

### T9 — QA, packaging, report (this commit)
- `scripts/check-contrast.mjs` (W-040), `scripts/qa-browser.mjs` (CDP, dependency-free),
  17 screenshots, this report. Five `text-ink-400` **text** usages moved to `ink-500` (W-040).

## 3. Test results

| Suite | Before phase | After phase |
|---|---|---|
| Test files | 14 | 20 |
| Tests passing | 128 | **176** |

New suites: `primitives.test.tsx` (10), `shellDrawer.test.tsx` (6), `LoginPage.test.tsx` (2),
`SessionHeader.test.tsx` (3), `ResultDetails.test.tsx` (8), `SessionAccess.test.tsx` (2);
`handlers.test.ts` grew 25 → 36 (the v1.1 rules); `format.test.ts` +1 (`faTime`);
`DoctorsPage.test.tsx` +2; `AdminPages.test.tsx` +3.

**Changed tests (markup changed on purpose; behaviour never weakened):**

| Test | Change | Reason |
|---|---|---|
| `App.test.tsx` «renders the application shell» | `getByText` → `getAllByText('آزمایشگاه پزشک مجازی')` | the login page now shows the app name twice (brand panel) |
| `labels.test.ts` triage palette test | «uses the red palette…» → «maps every triage level to its §1.2 design token» + can't-miss chips assert `success`/`warning`/`danger` | `ROUTINE_DAYS` is deliberately blue now; assertions moved to token classes (W-038) |
| `HistoryPage.test.tsx` tab test | `getByText` → `getByRole('tab')` + `aria-selected` | tabs are a real `role="tablist"` now (W-039) |
| `AdminPages.test.tsx` admin detail | asserts no feedback up/down buttons | admin detail renders feedback read-only (W-022 verified) |

## 4. Contrast (§9.7)

`node scripts/check-contrast.mjs` — WCAG 2.1 ratios over the 69 token pairs the components use,
with alpha foregrounds blended (sidebar 78% white, toast close button):

```
69 pairs checked: 62 pass, 3 icon warning(s), 5 exempt, 0 failure(s)
[check-contrast] OK — every text pair is at least 4.5:1
```

- **Text pairs ≥ 4.5:1 (hard criterion):** all 55 pass. Lowest text pair: `ink-500` on
  `primary-100` at 4.60:1. All badge pairs (`-700` on `-100`) are 5.5:1–7.6:1.
- **Placeholders ≥ 3:1:** `ink-400` on surface/canvas/disabled-bg pass (3.65–4.26:1).
- **3 warnings (reported, not failures):** `warning-600` at 2.69–2.94:1 as an *icon/bar/border*
  colour on `warning-100`/`neutral-100`/surface. §1.1 prescribes exactly this role for `-600`
  and mandates `-700` for text, and every warning icon/border is redundant with adjacent
  Persian text, so colour never carries meaning alone (W-040).
- **Exempt:** disabled `disabled-text`/`disabled-bg` (WCAG 1.4.3 exception, §5.1 pair), the
  logo accent pulse and the typing dots (aria-hidden decoration).
- The script also fails the build if a `text-*`/`bg-*` token class is used in `src/` without a
  pair row, so the table cannot silently go stale.
- **Fix made by this check:** five `text-ink-400` *text* usages (the `—` empty-value dashes in
  `ResultCard`/`BackstagePanel`/`MetricsTable`, the read-only feedback caption, the empty-turn
  caption) moved to `ink-500` (4.24:1 → 5.14:1 on surface). `ink-400` remains on real
  placeholders and input icons, per §1.1's role table.

## 5. Real-browser QA (§9) — `scripts/qa-browser.mjs`

Headless Chrome driven over CDP against `npm run dev` (MSW on). Per viewport, as the evaluator
and then the admin; plus deep checks at 1280 px. **107 checks, 0 failures, no console errors.**

| Viewport | Route/overflow/banner checks | Result |
|---|---|---|
| 375 px (mobile emulation) | 21 PASS | no overflow (scrollWidth == clientWidth on all 8 routes), banner visible+sticky, drawer opens + closes on Escape/overlay/navigation with focus returned, «منو» visible, no admin items for the evaluator, blindness clean, reveal present |
| 768 px | 20 PASS | as above (tablet, drawer mode) |
| 1024 px | 20 PASS | sidebar visible, menu button hidden, `aria-current` on «سوابق من» |
| 1280 px | 21 PASS + deep checks | same, plus the checks below |
| 1440 px | 25 PASS | same, sidebar mode |

Deep checks at 1280 px (all PASS):

- **Real login through the MSW-backed form** (native value setters + `requestSubmit`):
  `POST /auth/login` intercepted, redirect away from `/login`.
- **Chat round-trip** against the mocks: typing bubble shown, composer disabled during the
  turn, reply appended.
- **`prefers-reduced-motion`**: with the feature emulated, the typing dots compute
  `animation-duration: 1e-06s`, `iteration-count: 1` (the §1.4 rule in action).
- **Focus ring (§9.5)**: a trusted CDP Tab press moves focus and the focused element computes
  `outline: 2px solid` from the `:focus-visible` rule (`matches(':focus-visible') === true`),
  44 px minimum target observed.
- **Evaluation → reveal**: the 9 KPI radios + the two verdict selects + submit on the
  completed-unevaluated fixture → the reveal card appears
  («پشت این پزشک مجازی چه بود؟ معماری ساختاریافته، مدل google/gemini-…»).

### §9 checklist

| Item | Result |
|---|---|
| Every page RTL; no horizontal page scroll at 375/768/1024/1280/1440 px | ✅ 0 offenders on all 8 routes × 5 viewports |
| Banner visible and sticky on every page, including /login and the chat | ✅ probed per route; `/login` probed signed-out at 1280/375 |
| No model slug / architecture word / agent id / config before evaluation | ✅ 16-needle DOM scan on `/`, the active chat, the completed-unevaluated session and `/history` × 5 viewports |
| Sidebar/drawer items per UI_SPEC §2 per role; drawer traps focus, closes on Escape | ✅ (focus-inside verified on open) |
| Visible focus ring; ≥ 44×44 px touch targets on mobile | ✅ `:focus-visible` ring verified via a trusted Tab; 44 px target measured |
| Emergency recognizable without colour (icon + label + alert title) | ✅ `emergency-alert` with the Siren icon + lg badge + title text (unit-tested in `ResultDetails.test.tsx`) |
| All text/background pairs ≥ 4.5:1 (script over the pairs actually used) | ✅ 69 pairs, 0 failures (§4) |
| No hex or default-palette classes outside the token files | ✅ §3 greps return nothing (hex only in `index.css`; `#` count in `.ts`/`.tsx` = 0) |
| `prefers-reduced-motion` disables skeleton and typing animations | ✅ computed `1e-06s` / `iteration 1` |
| Composer above the mobile keyboard / safe area | ✅ `env(safe-area-inset-bottom)` padding (code-inspection; cannot be emulated in headless) |

### Screenshots (`docs/reports/phase-2-screenshots/`, 17 files)

`login-1280/375`, `doctors-1280/375`, `session-active-1280/375`, `session-completed-1280/375`,
`session-revealed-1280`, `history-1280/375`, `admin-dashboard-1280/375`,
`admin-sessions-1280/375`, `admin-detail-1280/375`.

## 6. Invented strings

All static Persian copy lives in `src/i18n/uiText.ts`; strings with no UI_SPEC source are
marked `invented` in-file (W-014/W-027). This phase added three (all accessible names that
§5.2/§4.2 of the design system explicitly require but UI_SPEC does not name):

| String | Where |
|---|---|
| `PASSWORD_SHOW` «نمایش رمز» / `PASSWORD_HIDE` «پنهان کردن رمز» | password toggle aria-labels (DESIGN_SYSTEM §5.2) |
| `NAV_MENU` «منو» | drawer trigger aria-label (DESIGN_SYSTEM §4.2) |

Pre-existing invented strings (unchanged, still flagged): `CHAT_LOG_LABEL`,
`CHAT_NOTE_NEEDS_RATING`, `EVALUATION_KPI_TITLE`, `EVALUATION_COMMENTS_TITLE`,
`EVALUATION_COMPARE_SELECT`.

## 7. New `W-xxx` decisions

| ID | Decision |
|---|---|
| W-028 | `ApiErrorCode` + runtime `API_ERROR_CODES`; `ApiError.code` stays `string` for the `HTTP_<status>` fallback |
| W-029 | MSW kept out of production: alias `@/mocks/browser` → stub + `copyPublicDir` gated + `check-no-msw.mjs` |
| W-030 | Strict evaluation-body validation in the mocks, before the state checks (matches B-019/B-020) |
| W-031 | 403 on `/sessions/:id` renders the full-page «دسترسی ندارید» state (permanent, not retryable) |
| W-032 | The 409 `EVALUATION_LOCKED` toast is owned by `SessionContent` (it outlives the unmounting form) |
| W-033 | `.overlay-scrim` in `index.css` (Tailwind cannot opacity-modify a `var()` colour) |
| W-034 | `SegmentedRating` keeps the visible Persian digit as the radio's accessible name |
| W-035 | One `SegmentedControl` with a `mode` prop (group / tabs / radios) |
| W-036 | `Toast`/`Skeleton` live in `ui/`; `ConfirmDialog` rebuilt on `Modal`+`Button` |
| W-037 | Sidebar always in the DOM (`lg:` hidden), drawer rendered open-only; `top-14`/`top-0` banner offsets |
| W-038 | §1.2 token colours; emergency Alert pattern; probability-bar thresholds; focus-on-error (+2 changed tests) |
| W-039 | Tabs `role="tablist"`; recharts + `ResizeObserver` stub; recent-sessions card (+1 changed test) |
| W-040 | The contrast script's pass/fail policy (text ≥ 4.5 hard, `-600` icon roles as warnings, disabled/decor exempt) and the ink-400 → ink-500 text fix |

## 8. Known issues

1. **`warning-600` icons sit below 3:1 on warning backgrounds** (2.69–2.94:1). This is the
   design system's own §1.1 prescription (`-600` for icons/borders, `-700` for text) and no
   meaning is carried by colour alone, so the script reports warnings rather than failures.
   If product wants strict WCAG 1.4.11 compliance, `warning-600` needs a darker step — a token
   change owned by the design system, not by this codebase.
2. **Vite chunk-size warning** on `npm run build` (`recharts` chunk > 500 kB). Cosmetic; a
   `manualChunks` split is deferred until phase 3 shows whether the real bundle ships this way.
3. **Transient MSW worker console error** (`Failed to update a ServiceWorker … Not found`)
   appeared once across many QA runs: a headless-run race where a registration from a previous
   profile retries during startup. The worker is always served (verified `200
   text/javascript`); phase 1's `try/catch` keeps it non-fatal. Not reproducible reliably.
4. **Composer safe-area (§9.10)** is verified by code inspection + `env(safe-area-inset-bottom)`
   padding; headless Chrome cannot emulate a real mobile keyboard.
5. **The CDP focus probe** must run in a fresh tab: `Input.dispatchKeyEvent` degrades in a
   long-lived automation session (the diag script proved the same press works immediately
   after creation). Encoded in `scripts/qa-browser.mjs`.

## 9. Next steps for phase 3 (integration)

1. Point the dev proxy at the real backend and reconcile the seed users
   (`doctor`/`doctor2`/`admin`) with the backend's dev seed (D-029).
2. Run the same 16-needle blindness probe against **real** backend payloads (the mock-shaped
   `BackstageTurn` fields may differ; the generic renderer must not branch on architecture).
3. Retire `VITE_USE_MOCKS` from the deployed path (mocks stay for tests/dev only) and keep
   `scripts/check-no-msw.mjs` in CI.
4. Exercise the v1.1 error surface end-to-end against the backend: 405/500 mappings, the 30 s/90 s
   client timeouts, and the 409 `EVALUATION_LOCKED` toast + refetch on a genuinely stale page.
5. Wire the nginx `API_UPSTREAM` into the compose stack and re-run the container checks from
   phase 1 (standalone boot, 502-without-backend, deep links).
6. Split the `recharts` chunk (`manualChunks`) if the production bundle keeps the warning.
