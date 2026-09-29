# Progress

Milestone-level status, maintained by Vahid + Claude chat. Task-level progress lives in `backend/docs/progress.md` and `web/docs/progress.md`.

| Milestone | Description | Owner | Status |
|---|---|---|---|
| M0 | Docs + API contract v1 frozen + repo structure | Vahid | ✅ Done (2026-09-29) |
| M1 | Backend core, architectures A/B, guard, tracing, tests | Backend coder | ✅ Done (2026-09-30) — 243 tests, 97% coverage, guard 100% |
| M1' | Frontend against MSW mocks | Frontend coder | ✅ Done (2026-09-29) — 128 tests, image builds |
| M1.5 | Contract v1.1, design system, root git | Vahid + Claude chat | ✅ Done (2026-09-30) |
| M2 | Integration + `smoke-test` passes for all enabled agents | Both | ⏳ In progress |
| M3 | Internal QA (~10 role-play cases) and prompt tuning | Vahid | ⏳ Not started |
| M4 | Physician evaluation period | Physicians | ⏳ Not started |
| M5 | Decision report | Vahid | ⏳ Not started |

## Phase plan

| Phase | Owner | Scope | Depends on | Status |
|---|---|---|---|---|
| Backend phase 2 | Backend coder | Contract v1.1, owner-only access, D-024, dev-server seeding, Gemini slugs, real smoke test, root `docker-compose.yml` | Root git, `backend/.env` with key | ⏳ |
| Web phase 2 | Frontend coder | Design system (`DESIGN_SYSTEM.md`), UI_SPEC v1.1, contract v1.1 on mocks | Root git | ⏳ |
| Web phase 3 | Frontend coder | Real-API integration: conformance suite, browser E2E, compose smoke | Backend phase 2, web phase 2 | ⏳ |
| M2 report | Vahid + Claude chat | `docs/reports/M2-integration.md` from the three reports | All above | ⏳ |
| Backend phase 3 (M3) | Backend coder | Prompt tuning as `prompts/v2` from QA findings (1–3 iterations) | M2 | ⏳ |
| Backend phase 4 | Backend coder | Server deployment, SQLite backup, physician accounts | M3 | ⏳ |

## Log

- 2026-09-29 — Initial documentation set created: PRD, ARCHITECTURE, AGENT_SPEC, API_CONTRACT, UI_SPEC, decisions, progress.
- 2026-09-29 — Repo restructured into root `docs/`, `backend/`, `web/`; `CLAUDE.md` (backend) and `AGENTS.md` (web) added.
- 2026-09-29 — Web phase 1 complete (report: `web/docs/reports/phase-1-web-mock.md`).
- 2026-09-30 — Backend phase 1 complete (report: `backend/docs/reports/phase-1-backend-core.md`). Real smoke test not run (no key); two Gemini slugs invalid.
- 2026-09-30 — Reviewed both phase-1 reports. Decisions D-018 … D-029: contract v1.1 (CCR #1/#2, Q-1…Q-4 closed), Gemini slugs, D-024, design system adopted, root git, phase order, dev seeding. Docs updated: `API_CONTRACT.md` v1.1, `BACKEND_ARCHITECTURE.md` v1.1, `AGENT_SPEC.md` v1.1, `UI_SPEC.md` v1.1, new `web/docs/DESIGN_SYSTEM.md`.
