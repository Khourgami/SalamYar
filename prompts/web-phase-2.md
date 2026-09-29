# Web Phase 2 — Design System and Contract v1.1 (on mocks)

You are a **senior frontend engineer** (React 18, TypeScript strict, Tailwind CSS, TanStack Query, MSW, Vitest + React Testing Library) with strong experience in **Persian RTL interfaces and accessibility**. You continue the `web/` project of the AI Triage Agent Lab. Phase 1 is complete (128 tests, image builds). In this phase you apply the new visual design and the contract v1.1 changes, still against the MSW mocks. You do **not** connect to the real backend in this phase.

## 1. Read first, in this order

1. `web/AGENTS.md`
2. `docs/decisions.md` — especially the new **D-018 … D-029**
3. `docs/API_CONTRACT.md` — now **v1.1**; start with the changelog at the top
4. `web/docs/UI_SPEC.md` — now **v1.1**; read its precedence note and change list at the top
5. `web/docs/DESIGN_SYSTEM.md` — new; **read §8 ("do not copy") before looking at the mockup**
6. `web/docs/design/mockup-reference.png` — visual reference only
7. `web/docs/decisions.md`, `web/docs/progress.md`, `web/docs/reports/phase-1-web-mock.md`, `web/docs/contract-questions.md`

## 2. Rules

- **Boundary.** Write only inside `web/`. Never edit `docs/`, `backend/`, `web/docs/UI_SPEC.md`, or `web/docs/DESIGN_SYSTEM.md`.
- **Precedence (D-026).** `UI_SPEC.md` decides features, fields, copy, and behavior. `DESIGN_SYSTEM.md` decides visuals. The mockup decides nothing on its own. If they conflict, follow that order and record a `W-xxx` decision.
- **No new features.** No new routes, endpoints, fields, or navigation items. Persian copy comes verbatim from `UI_SPEC.md`; any string with no UI_SPEC source must be marked `invented` in `src/i18n/uiText.ts` (W-014) and listed in the report. Keep invented strings to the minimum (aria-labels such as «منو» are fine).
- **Blind evaluation.** No agent id, model slug, architecture word, or config value may reach the DOM before the evaluation is submitted — including `title`, `alt`, `aria-*`, `data-*` attributes and URLs.
- **Tests.** Every phase-1 behavior test must keep passing. Change a test only when the markup changed on purpose (for example a selector or accessible name), never to weaken what it checks. List every changed test and the reason in the report. Never delete a behavior test.
- **Styling.** All colors, radii, and shadows come from the tokens (`DESIGN_SYSTEM.md §1–§3`). No hex values in `.ts`/`.tsx`, no default Tailwind palette classes.
- **Conflicts / unclear contract.** Take the most conservative option, record a `W-xxx` decision, and if it concerns the API add a row to `web/docs/contract-questions.md`.
- **Git (D-027).** The repository now exists at the project root on `main`. From inside `web/`, stage only web paths: `git add -- .` (run inside `web/`), never `git add -A` at the root. The backend coder works in the same working tree at the same time: if `.git/index.lock` exists, wait a few seconds and retry; never delete it. If a remote exists, `git pull --rebase` before committing. Commit prefix `web:`, at least one commit per task. Never commit `.env`, `node_modules/`, or `dist/`.
- **Per-task loop:** implement → write the task's tests → `npm run build`, `npm run lint`, `npm run test` all green → update `web/docs/progress.md` (task table + one log line) and `web/docs/decisions.md` (every decision you made) → commit.

## 3. Tasks

### T1 — Housekeeping and contract v1.1

1. **Git:** confirm `git rev-parse --show-toplevel` is the project root. Set W-005's status to `Superseded by D-027`. Add a "Phase 2" task table (T1–T9) to `web/docs/progress.md`.
2. **Contract questions:** in `web/docs/contract-questions.md`, set Q-1 and Q-2 to `answered (D-020)` and Q-3 and Q-4 to `answered (D-021)`, each with a one-line summary of the answer.
3. **Types:** add `METHOD_NOT_ALLOWED` and `INTERNAL_ERROR` to the error-code type (and to its runtime list if one exists).
4. **Mocks (MSW) to v1.1:**
   - add the user `doctor2` / `doctor123` (evaluator, «دکتر آزمایشی ۲»), matching the backend dev seed (D-029);
   - session-scoped endpoints (`GET /sessions/{id}`, messages, finish, feedback PUT/DELETE, evaluation) are owner-only for every role: a non-owner, **including admin**, gets 403 `FORBIDDEN`; an unknown id gets 404 first;
   - a second evaluation → 409 `EVALUATION_LOCKED`;
   - the evaluation body is strict: every `EvaluationInput` key must be present (nullable ones as `null`, including `comparison`), unknown keys are rejected, scores must be integers 1–5 → otherwise 400 `VALIDATION_ERROR`; the body is validated before the state checks;
   - feedback checks in the contract order (404 → 403 → 400 wrong kind → 409); deleting non-existent feedback → 204;
   - `GET /sessions` and `GET /admin/sessions` are newest first.
5. **UI behavior:**
   - verify the evaluation form always sends every key (empty optional fields as `null`, `comparison: null` when unchecked); fix it if not;
   - on submit, 409 `EVALUATION_LOCKED` → the toast «این جلسه قبلاً ارزیابی شده است.» and a session refetch;
   - on `/sessions/:id`, a 403 → the full-page state «دسترسی ندارید» with a link to `/`;
   - feedback controls render only on `/sessions/:id`; `/admin/sessions/:id` shows feedback read-only (verify; W-022).
6. **Dead MSW chunk (phase-1 known issue 1):** when `VITE_USE_MOCKS` is not `true` at build time, alias `@/mocks/browser` to an empty stub module in `vite.config.ts`, so the production `dist/` has no MSW code. Keep dev mode with mocks working.

**Tests:** handler tests for each new mock rule (403 matrix for doctor2 and admin on the 6 endpoints, 404 before 403, second evaluation 409, missing `comparison` key → 400, newest-first order); UI tests for the 409 toast + refetch, the 403 page state, and the absence of feedback buttons on the admin detail page; a build check (a small script or test step) proving that `dist/` contains no file mentioning `msw` after `VITE_USE_MOCKS=false npm run build`.
**Done when:** all of the above pass.

### T2 — Tokens and UI primitives

- Add the CSS variables of `DESIGN_SYSTEM.md §2` to `src/index.css`, the Tailwind mapping of §3, base styles (canvas background, font stack, `:focus-visible` ring), the RTL icon-mirroring utility, and a `prefers-reduced-motion` rule.
- Build or restyle the primitives in `src/components/ui/` per §5: `Button` (primary/secondary/ghost/danger; sizes; loading), `TextField`, `PasswordField` (show/hide toggle), `TextArea`, `Select`, `Card`, `Badge`, `Alert`, `Modal`, `Toast`, `Skeleton`, `SegmentedControl` (tabs/group-by/winner radios), `SegmentedRating` (§5.10). Reuse existing components where they exist; keep their public props compatible.
- Add `lucide-react` if it is not already a dependency.

**Tests:** `Button` renders each variant, blocks clicks while loading, and sets `aria-busy`; `TextField` associates the label and sets `aria-invalid` + `aria-describedby` on error; `PasswordField` toggles the input type; `Modal` traps focus, closes on Escape, and returns focus to the trigger; `SegmentedRating` uses native radios (arrow keys change the value) and shows the anchors under 1, 3, and 5.
**Done when:** the tests pass and the primitives are used by the confirm dialog and toasts.

### T3 — App shell

- Desktop (≥ 1024 px): the sidebar of `DESIGN_SYSTEM.md §4.1`. Below 1024 px: the top bar and drawer of §4.2. The test banner of §4.3 on every page, sticky and non-closable. The logo mark of §4.4 (inline SVG).
- Navigation items, labels, and role gating stay exactly as in phase 1 / UI_SPEC §2. The active item has `aria-current="page"`.

**Tests:** the phase-1 shell tests still pass; the drawer opens from the menu button and closes on Escape, on overlay click, and on navigation, returning focus to the button; admin items are absent for an evaluator; `aria-current` is on the active item; the banner is present on `/login` and on a protected page.
**Done when:** the tests pass.

### T4 — Login page (`DESIGN_SYSTEM.md §6.1`, UI_SPEC §3.1)

Two-column desktop layout with the brand panel and the form card («ورود به سامانه»), one column on mobile, the password show/hide toggle, the error as a danger Alert, and focus moved to the username field after a failed login. No forgot-password link.

**Tests:** the phase-1 login tests pass; after a failed login the error is shown and the username field has focus; no link or button other than `ورود` and the password toggle exists in the form.
**Done when:** the tests pass.

### T5 — Doctors list (`§6.2`)

The responsive grid, the identical neutral avatar, the card layout, the button loading state (other buttons disabled meanwhile), and the hint in an info Alert. No specialty text or per-agent avatar.

**Tests:** the phase-1 blindness test still passes; every card renders the same avatar element; while one `POST /sessions` is pending, the other buttons are disabled.
**Done when:** the tests pass.

### T6 — Session page: chat (`§6.3`, `§5.11`)

The session header (back link, avatar + name, status chip, question counter, finish button while active), the restyled bubbles (agent right, patient left, error bubble with `ارسال دوباره`, typing bubble), the feedback row, and the sticky composer (auto-grow 1–5 lines, safe-area padding, `ارسال` with `aria-label` when icon-only). No attachment button. All phase-1 chat behavior is unchanged.

**Tests:** the phase-1 `ChatPanel` tests pass; the send button's accessible name is «ارسال» at every width; the composer is not rendered for a completed session; the status chip shows the Persian status label.
**Done when:** the tests pass.

### T7 — Result card, backstage, evaluation, reveal (`§6.4–§6.6`)

- Result card: the emergency Alert block for `EMERGENCY_NOW`, the triage colors of `DESIGN_SYSTEM.md §1.2` (note: `ROUTINE_DAYS` is now **blue**), the probability bar, the key/value grid, the tables, the chips.
- Backstage: the collapsible timeline card (open by default) with the generic renderer (W-017 unchanged) and the mini hypothesis table per UI_SPEC §3.3.
- Evaluation form: sections, `SegmentedRating` for the 9 KPIs (no stars), the safety-flag box, the winner `SegmentedControl`, validation and scroll/focus to the first error; the read-only summary and the reveal card after submission.

**Tests:** the phase-1 result, backstage, and evaluation tests pass; `EMERGENCY_NOW` renders an alert with its title text and icon; each triage level maps to its token classes (a table-driven test over the 5 levels); the hypothesis mini table shows `name_fa`, `name_en`, and a Persian percentage; KPI validation marks an unrated `SegmentedRating` and focuses it; the reveal card is absent before submission and present after it.
**Done when:** the tests pass.

### T8 — History and admin (`§6.7–§6.9`, UI_SPEC §3.5)

- `/history`: the segmented tabs and the restyled table with `sm` badges and evaluated chips.
- `/admin`: group-by control, reload button, the 4 summary cards (exact sums over the current rows), the chart (`recharts`, add it as a dependency) with the three rate series and the caption, the recent-sessions card (`GET /admin/sessions?limit=5`, link «مشاهده همه»), the full metrics table (phase-1 columns and sorting), and the CSV card.
- `/admin/sessions` and its detail: restyled per §6.9; behavior unchanged.

**Tests:** the phase-1 history and admin tests pass; the summary cards show the correct sums for a mock metrics response with at least 2 rows; the chart card renders its title and caption (mock `ResizeObserver` / give the chart a fixed size in tests); a `null` rate does not break rendering; the recent-sessions card shows at most 5 rows and links to `/admin/sessions`.
**Done when:** the tests pass.

### T9 — QA, packaging, report

1. `npm run build`, `npm run lint`, `npm run test` green; `docker build -t triage-web .` succeeds.
2. The styling greps of `DESIGN_SYSTEM.md §3` return nothing.
3. A contrast script (`scripts/check-contrast.mjs` or similar) that computes WCAG ratios for every text/background token pair used by the components, failing below 4.5:1 for text. Run it and include the output.
4. Real-browser QA (headless Chrome as in phase 1) with mocks at **375, 768, 1024, 1280, 1440 px** on every route: no horizontal page overflow; the banner is visible; the drawer/sidebar works; the phase-1 blindness probe passes on `/`, the active chat, the completed-unevaluated session, and `/history`; the reveal appears after evaluation. Walk through the checklist in `DESIGN_SYSTEM.md §9` and report each item.
5. Capture one screenshot per main page at 1280 px and 375 px into `web/docs/reports/phase-2-screenshots/` for product review.
6. Write **`web/docs/reports/phase-2-design-system.md`** in English: summary; what changed per task; test results (count before/after, every changed test and why); QA results per viewport; the §9 checklist; the contrast output; the invented strings; new `W-xxx` decisions; known issues; next steps for phase 3 (integration).

**Done when:** everything above is done and committed.

## 4. Definition of done (phase)

- The app matches `DESIGN_SYSTEM.md` on every route at all five widths, with no item from §8 built.
- Contract v1.1 behavior is implemented in the mocks and the UI (T1).
- All phase-1 behavior tests pass, plus the new tests of each task; build, lint, and Docker build are green.
- No blindness leak; no hex or default palette classes outside the token files; all text contrast ≥ 4.5:1.
- `progress.md`, `decisions.md`, `contract-questions.md`, the report, and the screenshots are committed with `web:` prefixes.
