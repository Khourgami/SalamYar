# M2 — Integration Report

**Date:** 2026-09-30 · **Author:** product side (Vahid + Claude chat) · **Status:** ✅ accepted (D-040)
**Sources:** backend reports phase 1, 2, 2b, 2b-2, 2c (`backend/docs/reports/`); web reports phase 1, 2, 3, 3b (`web/docs/reports/`).

## 1. Result

The PoC works end-to-end: web (nginx) → FastAPI → OpenRouter → seven models. Every path of `API_CONTRACT.md` v1.2 is verified, with no drift between web and backend. Eight agents are enabled for M3 and all pass two real runs within the 80 s turn deadline. Total API spend so far: **USD 1.76** (of USD 50 on the key).

## 2. SYSTEM_OVERVIEW §7 checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Backend tests pass; smoke test passes for all enabled agents | ✅ | 358 tests, guard 100% line+branch; final smoke pair 2b-2: 8/8 enabled agents pass both runs |
| 2 | Web with `VITE_USE_MOCKS=false` against the backend; full flow for simple and structured agents | ✅ | Web 3: contract suite 35/35, browser E2E 60/60 at 1280/375 px |
| 3 | Error paths: 401 redirect, 409 turn in progress, 502 + resend | ✅ | Web 3 steps 3–6; backend deadline tests (502 on `deadline_exceeded`, resend succeeds) |
| 4 | `docker compose up --build` serves the app on :80 | ✅ | Backend 2, 2b, 2b-2: real turns through nginx (overhead 50–70 ms) |
| 5 | Integration report | ✅ | This document |

## 3. Agents for M3

| Agent | Arch | Model | Smoke p50 / max turn (s) | Est. cost per short triage (USD, reported) |
|---|---|---|---|---|
| b-gemini3flash | B | gemini-3-flash-preview | 7.0 / 8.2 | 0.013 |
| b-gpt54mini | B | gpt-5.4-mini | 7.3 / 24.7 | 0.020 |
| b-sonnet55 | B | claude-sonnet-5.5 | 8.9 / 13.8 | 0.064 |
| b-gemini31pro | B | gemini-3.1-pro-preview | 8.7 / 11.5 | 0.055 |
| b-gpt54 | B | gpt-5.4 | 18.8 / 28.9 | 0.064 |
| b-deepseekv4pro | B | deepseek-v4-pro-0813 | 29.6 / 45.3 | 0.039 |
| a-sonnet55 | A | claude-sonnet-5.5 | 5.0 / 19.4 | 0.047 |
| a-gpt54 | A | gpt-5.4 | 4.5 / 25.6 | 0.033 |

"Short triage" = the smoke script (2 patient messages + forced conclusion). Real sessions will be about 2–3× longer and costlier. `b-gptoss120b` is off (D-036 gate: its assessment call did not finish within 50 s); backend phase 2d gives it a fair second test with provider selection (D-041).

## 4. Targets

- **NFR-2 (revised, D-037):** 6/8 enabled agents meet their targets. Misses: `b-deepseekv4pro` (p50 29.6 s, p90 45.3 s), `a-gpt54` (p90 25.6 s, marginal). No agent exceeds 75 s; the backend always answers before the web client's 90 s timeout (D-038).
- **Validity:** 0 repairs in the final pair for all 8 enabled agents.
- **Safety text checks (smoke replies):** no Latin script, no drug names or doses.
- **Blindness:** no model, architecture, agent id, cost, token, or call-count leak before evaluation (web 2, 3, 3b probes; backend `usage_visible`).

## 5. Open issues carried into M3

1. **Patient echo:** in architecture A, three models (Gemini 3.1 Pro, DeepSeek 0813, gpt-oss) once wrote the patient's own words as the final message. All three A agents are disabled; handled in the prompt-v2 phase (D-043). Watch for it in M3.
2. **Ignored forced conclusion** (`a-gemini3flash`, once `a-deepseekv4pro`): disabled agents only; prompt-v2 phase.
3. **Repetition:** DeepSeek re-asks the pain location in consecutive turns; Gemini Flash once repeated a question. M3 will show how common this is.
4. **Coverage of the smoke script:** one complaint, two turns, always a forced conclusion. Agent-concluded B turns (turn + assessment in one budget) and long sessions are first seen in M3.
5. **Cost estimate** overstates cached calls (fixed in phase 2d, D-042); reported cost is correct.
6. **Environment:** a system proxy on the dev machine intercepts `localhost` for Python clients (`NO_PROXY=localhost`). `APP_PUBLIC_URL`/`CORS_ORIGINS` must be set for the target host at deployment. The OpenRouter key and `JWT_SECRET` used so far must be rotated before physicians get access.

## 6. Next

Backend phase 2d (M3 readiness) → M3 QA per `docs/qa/M3-qa-protocol.md` on a fresh database → prompt-v2 phase from the QA findings.
