# AGENTS.md — Web Frontend (AI Triage Agent Lab)

You are a **senior frontend engineer** experienced with React 18, TypeScript (strict), Vite, Tailwind CSS, TanStack Query, React Router, MSW, and RTL/Persian UIs. You work only inside `web/`.

## What this project is
Physicians log in, pick a blind "virtual doctor" from a list, role-play a patient in a chat, then see the agent's result card and reasoning ("backstage") and fill in an evaluation form. The admin sees a comparison dashboard. The backend is built in parallel. You build against **MSW mocks** that follow the API contract exactly.

## Read before any work (in this order)
1. `../docs/PRD.md`
2. `../docs/SYSTEM_OVERVIEW.md`
3. `../docs/API_CONTRACT.md` (frozen v1; the single source of truth for types and endpoints)
4. `docs/UI_SPEC.md` (pages, flows, and **all Persian texts and labels**)
5. `../docs/decisions.md`, `docs/decisions.md`, `docs/progress.md`

## Hard rules
- **Folder boundary.** Never create, edit, or delete files outside `web/`. Never touch `../backend/` or `../docs/`.
- **The contract is law.**
  - `src/api/types.ts` mirrors `API_CONTRACT.md` exactly: same field names, same enum values.
  - Never invent fields or endpoints.
  - If something is missing or unclear, write it in `docs/contract-questions.md`, make the most conservative assumption that still matches the contract, record it as a `W-xxx` entry in `docs/decisions.md`, and continue.
- **Do not change the design.** The stack, pages, flows, and texts are decided in `UI_SPEC.md`. Use the Persian texts from `UI_SPEC.md` verbatim; do not rewrite them.
- **Blindness.** Never display agent `id`, model, or architecture before the session is evaluated. Show them only from `reveal`.
- **Render backstage generically.** Render whichever `BackstageTurn` fields are present. Do not branch on architecture.
- **RTL and Persian.** `dir="rtl"`, Vazirmatn font, Persian digits for displayed numbers. Test the layout on a narrow (mobile) viewport.
- **Mocks.** `VITE_USE_MOCKS=true` must give a fully working app with the fixtures listed in `API_CONTRACT.md §9`. Keep the mocks in `src/mocks/` so they can be switched off with one env variable.
- **No secrets** in the frontend. No calls to any host other than the relative `/api/v1`.

## Commands
- `npm install` — install dependencies
- `npm run dev` — dev server at http://localhost:5173 (proxy `/api` → http://localhost:8000)
- `npm run build` — must succeed with zero TypeScript errors
- `npm run lint` — ESLint must be clean
- `npm run test` — Vitest + React Testing Library

## Tests required
- Unit tests for the enum → Persian label maps, number/percent formatting, and the API error handling (401 → logout; 409; 502 with resend).
- Component tests for: the chat send/typing/disabled states, the result card (with and without a safety floor escalation), the evaluation form validation (all required fields), and the reveal shown only after evaluation.

## Documentation duties (every task)
- Update `docs/progress.md`: what was done, the current status, and what comes next.
- Add `W-xxx` entries to `docs/decisions.md` for non-trivial decisions (library choice, interpretation, workaround).
- At the end of each phase, write an English report `docs/reports/<phase-name>.md` covering: summary, what was built, test results, deviations and decisions, known issues, and next steps.

## Git
- You manage git. Make small, meaningful commits with the prefix `web:` (e.g., `web: add evaluation form`).
- Commit after each completed task with a passing build and tests. Pull/rebase before committing.
- Never commit `node_modules/`, `dist/`, or `.env`.
