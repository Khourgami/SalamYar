# Progress

Milestone-level status, maintained by Vahid + Claude chat. Task-level progress lives in `backend/docs/progress.md` and `web/docs/progress.md`.

| Milestone | Description | Owner | Status |
|---|---|---|---|
| M0 | Docs + API contract v1 frozen + repo structure | Vahid | ✅ Done (2026-09-29) |
| M1 | Backend core, architectures A/B, guard, tracing, tests | Backend coder | ✅ Done (2026-09-30) |
| M1' | Frontend against MSW mocks | Frontend coder | ✅ Done (2026-09-29) |
| M1.5 | Contract v1.1, design system, root git | Vahid + Claude chat | ✅ Done (2026-09-30) |
| M2 | Integration + `smoke-test` passes for all enabled agents | Both | ✅ Done (2026-09-30) — `docs/reports/M2-integration.md` |
| M3 | Internal QA (~10 role-play cases) and prompt tuning | Vahid | ⏳ Not started — protocol ready (`docs/qa/M3-qa-protocol.md`) |
| M4 | Physician evaluation period | Physicians | ⏳ Not started |
| M5 | Decision report | Vahid | ⏳ Not started |

## Phase plan

| Phase | Owner | Scope | Depends on | Status |
|---|---|---|---|---|
| Backend phase 2 | Backend coder | Contract v1.1, owner-only access, D-024, dev server, Gemini slugs, compose | — | ✅ Done (T6 steps 2–6 moved to 2b) — 296 tests |
| Web phase 2 | Frontend coder | Design system, UI_SPEC v1.1, contract v1.1 on mocks | — | ✅ Done — 176 tests, 107/107 browser checks |
| Web phase 3 | Frontend coder | Real-API integration against the dev server | Backend 2, web 2 | ✅ Done (T5 moved to backend 2b, D-030) — 35/35 contract, 60/60 E2E, 0 drift |
| Backend phase 2b | Backend coder | Real smoke test, D-025 fixes, compose smoke with a real model | `backend/.env` with key | ✅ Done — USD 0.87, 306 tests, no config fix needed; latency above target, DeepSeek-B > 90 s |
| Backend phase 2b-2 | Backend coder | D-034 model set (+ gpt-oss-120b), D-036 DeepSeek config + M3 gate, D-038 turn deadline, re-smoke | Backend 2b | ✅ Done — USD 0.89, 322 tests, 8 agents enabled, b-gptoss120b gated off |
| Backend phase 2c | Backend coder | Token/cost accounting, pricing, contract v1.2 (D-035) | Backend 2b-2 | ✅ Done — 358 tests, USD 0 |
| Backend phase 2d | Backend coder | M3 readiness: provider trace, cached tokens, open-weight provider selection (D-041, D-042) | Backend 2c | ⏳ |
| Web phase 3b | Frontend coder | Contract v1.2: stats and metric columns, cost hidden until evaluated, slow-turn hint (D-039) | Backend 2c | ✅ Done (W-044 … W-046) |
| M2 report | Vahid + Claude chat | `docs/reports/M2-integration.md` | Backend 2c, web 3b | ✅ Done |
| M3 QA | Vahid | Protocol runs, CSV export, notes | Backend 2d | ⏳ |
| Backend phase 3 | Backend coder | `prompts/v2` from QA findings (1–3 iterations) | M3 findings | ⏳ |
| Web phase 4 | Frontend coder | Post-QA UX fixes + cleanup (dead `CHAT_ERROR_TITLE`, `recharts` chunk split) | M3 findings | ⏳ |
| Backend phase 4 | Backend coder | Server deployment, SQLite backup, physician accounts | Host + domain | ⏳ |

## Log

- 2026-09-29 — Initial documentation set; repo restructured; web phase 1 complete.
- 2026-09-30 — Backend phase 1 complete. Decisions D-018 … D-029; docs v1.1; design system adopted.
- 2026-09-30 — Backend phase 2 complete (296 tests, 98% coverage, compose verified on :80). Gemini `-preview` slugs confirmed. Real smoke test blocked (no key).
- 2026-09-30 — Web phase 2 complete (176 tests, contrast 0 failures, 5 viewports × 0 overflow, no blindness leak).
- 2026-09-30 — Web phase 3 complete: contract suite 35/35 and browser E2E 60/60 against the dev server, no drift, no backend issue. Compose real-model smoke blocked (no key).
- 2026-09-30 — D-030 … D-033: real-model checks consolidated into backend phase 2b; M3 protocol; warning-icon contrast accepted; pathspec commits.
- 2026-09-30 — Backend phase 2b started: key valid (USD 50 limit), smoke table extended (305 tests). D-034 new model set; D-035 token/cost accounting (contract v1.2, UI_SPEC v1.2, BACKEND_ARCHITECTURE v1.2, PRD v1.1).
- 2026-09-30 — Backend phase 2b complete on the previous model set (report `backend/docs/reports/phase-2b-real-model-verification.md`). D-034 revised (+ gpt-oss-120b), D-036 … D-039: DeepSeek config and M3 gate, per-architecture latency targets, 80 s turn deadline, slow-turn hint.
- 2026-09-30 — Backend 2b-2 (final model set, 80 s turn deadline, gate) and 2c (token/cost accounting, contract v1.2) complete; web 3b complete. M2 accepted (D-040). D-041 … D-043: open-weight provider selection, cached tokens, prompt issues deferred to v2.
