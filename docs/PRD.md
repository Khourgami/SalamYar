# PRD — AI Triage Agent Lab (PoC / Demo)

**Status:** v1.0 (approved for PoC build)
**Owner:** Vahid
**Related docs:** `SYSTEM_OVERVIEW.md`, `API_CONTRACT.md`, `decisions.md` (this folder) · `backend/docs/BACKEND_ARCHITECTURE.md`, `backend/docs/AGENT_SPEC.md` · `web/docs/UI_SPEC.md`

---

## 1. Context

We will build a free AI triage assistant for low-income patients in Iran. The product itself is decided. Before building it properly, we need evidence about **which architecture, method, and LLM** produces the best triage behavior.

This PoC is a **throwaway demo** optimized for speed. After the results are reviewed, the product will be rebuilt from scratch with a production architecture. Code quality must be clean and tested, but robustness, scale, and security hardening beyond the basics are explicitly **not** goals.

The customers and evaluators in this phase are several physicians of different specialties. They are also the product owners. They log in, pick a "virtual doctor" (an agent) from a list, and **role-play a patient** in a text chat. They then evaluate how well the agent took the history, triaged, and referred.

The physicians provide **no clinical rules, red flags, or knowledge** in this phase. Agents rely only on the LLM's general medical knowledge plus our architecture and prompting methods. The PoC output will inform the clinical knowledge the physicians provide later.

## 2. Core concept

```
Agent = Architecture × LLM × Config
```

- **Architecture** is implemented once in code and is LLM-agnostic.
- **LLM** is any model reachable via OpenRouter's OpenAI-compatible API.
- **Config** holds parameters such as the max number of questions, emergency threshold, reasoning effort, and temperature.

Adding an agent requires adding a config entry only. No code changes.

## 3. Goals

| ID | Goal |
|---|---|
| G1 | Let physicians chat blindly with multiple agents and evaluate each conversation with structured KPIs plus free-text comments. |
| G2 | Compare 2 architectures × 6 LLMs on triage correctness, question quality, efficiency, safety, communication, cost, and latency. |
| G3 | Show physicians the agent's reasoning ("backstage") after each conversation so they can judge *why* it decided what it decided. |
| G4 | Store everything (transcripts, reasoning, LLM traces, costs, ratings, comments) for later review and export. |
| G5 | Deliver a working demo as fast as possible. |

## 4. Non-goals

- No real patient data. The UI must state that only role-play is allowed.
- No clinical rule engine, keyword red-flag scanner, or knowledge base.
- No voice input, PDF export, or share links.
- No multi-agent panel architecture or ensembles. These are deferred to the rebuild.
- No streaming responses.
- No production-grade security beyond hashed passwords, JWT, and HTTPS at deployment.
- No patient-facing product UI. The only users are evaluators and the admin.

## 5. Users & roles

| Role | Who | Can |
|---|---|---|
| `evaluator` | Physicians | Log in, see enabled agents (blind names), run sessions, view results and backstage, give per-message feedback, submit evaluations, see their own history. |
| `admin` | Vahid | Everything evaluators can do, plus: all sessions, dashboard metrics, CSV export, and reloading the agent config. |

Users are created by the admin via CLI. There is no self-registration.

## 6. Main user flow

1. The evaluator logs in with username and password.
2. The evaluator sees the list of enabled virtual doctors ("دکتر ۱", "دکتر ۲", …). Model and architecture are hidden. The order is shuffled per user.
3. The evaluator selects one. A session starts with a static greeting from the agent.
4. The evaluator writes as a patient. The agent asks questions turn by turn.
5. The session ends in one of three ways:
   - (a) the agent decides it has enough information,
   - (b) the question limit is reached, or
   - (c) the evaluator presses **"End and get result"**.
6. The agent shows its final message to the "patient". The **Result Card** and the **Backstage panel** are displayed.
7. The evaluator fills in the **Evaluation Form** (KPIs, safety flags, own verdict, comments). During the chat, the evaluator may also give 👍/👎 plus a note on any agent message.
8. After the evaluation is submitted, the agent's architecture and model are **revealed**.
9. The evaluator may start a new session with another agent. In the evaluation form they can link it to a previous session ("same case") and pick a winner.

## 7. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Username/password login. JWT bearer token. Roles `evaluator` and `admin`. |
| FR-2 | Agent list shows only enabled agents: blind `display_name` plus an optional short neutral description. Architecture and model are never exposed before evaluation. |
| FR-3 | Creating a session returns the static greeting immediately (no LLM call). |
| FR-4 | Each patient message returns exactly one agent turn: either the next question or the final result. |
| FR-5 | Hard cap on agent questions (`max_questions`, default 12). When reached, the final assessment is forced. |
| FR-6 | The evaluator can force the end of a session at any time. The final assessment is then produced from what is known. |
| FR-7 | The final result follows one schema for all architectures (`AssessmentResult` in `backend/docs/AGENT_SPEC.md`): triage level, emergency probability, primary and secondary specialty, differential with probabilities and supporting/against findings, can't-miss conditions checked, missing information, confidence, patient message, and clinical summary. |
| FR-8 | Backstage data is available only after the session is completed. It includes per-turn reasoning (for architecture B: clinical state, hypotheses, can't-miss list, emergency probability, question rationale), the raw vs. final triage level, and guard actions. |
| FR-9 | Per-message feedback: 👍/👎 plus an optional note on any agent message, editable until the evaluation is submitted. |
| FR-10 | Evaluation form (one per session). Fields are defined in `API_CONTRACT.md §6` and labels in `web/docs/UI_SPEC.md`. |
| FR-11 | Reveal: after the evaluation is submitted, the session detail includes the agent's architecture, model, and config summary. |
| FR-12 | Admin dashboard: per-agent metrics as defined in §9. |
| FR-13 | Admin CSV export of sessions, messages, evaluations, feedback, and LLM calls. |
| FR-14 | Admin can reload `agents.yaml` without a restart. |
| FR-15 | Every LLM call is traced: request messages, raw response, parsed output, model, tokens, cost, latency, retries, and errors. |

## 8. Agent behavior requirements (summary)

The full specification is in `backend/docs/AGENT_SPEC.md`.

- The agent acts as an experienced Iranian general practitioner doing remote triage in simple, polite, colloquial Persian.
- History taking is focused and hypothesis-driven. Dangerous conditions are checked first.
- At most 1–2 short, non-leading questions per message.
- The agent never prescribes drugs or doses and never states a definitive diagnosis to the patient. The differential is visible only to evaluators on the Result Card.
- Output uses one of five triage levels: `EMERGENCY_NOW`, `URGENT_24H`, `ROUTINE_DAYS`, `SELF_CARE`, `INSUFFICIENT_INFO`. It also names a specialty from a closed list.
- **Safety floor** (per agent, toggleable): if the emergency probability is at or above the threshold (default 0.20), the final triage level becomes `EMERGENCY_NOW`. Both the raw and final levels are stored.
- Patients under 12 are out of scope. The agent advises seeing a doctor directly, or the emergency department if emergency signs are present.

## 9. Evaluation metrics (dashboard)

Computed per agent, and also per architecture and per model:

1. **Under-triage rate**: the final triage is less urgent than the evaluator's verdict. This is the most important metric. Also reported separately for cases where the evaluator's verdict is `EMERGENCY_NOW`.
2. **Over-triage rate.**
3. **Triage exact-match rate.**
4. **Specialty match rate**: the evaluator's specialty equals the agent's primary or secondary specialty.
5. **Mean score for each KPI** (1–5).
6. **Safety flag counts.**
7. **Mean questions per session**, mean latency per turn (p50 and p90), and mean cost per session.
8. **Pairwise win rate** from "same case" comparisons.
9. **👍/👎 ratio** on agent messages.

`INSUFFICIENT_INFO` results are counted separately and excluded from the under- and over-triage calculations.

## 10. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Persian UI, RTL, and a readable Persian font. Works on desktop and mobile browsers. |
| NFR-2 | Latency target per agent turn: p50 ≤ 8 s, p90 ≤ 20 s. The LLM timeout is 60 s with one retry. |
| NFR-3 | OpenRouter requests must disallow providers that train on or store prompts (`provider.data_collection = "deny"`). |
| NFR-4 | A banner is visible on every page: "این محیط آزمایشی است. از اطلاعات بیمار واقعی استفاده نکنید." |
| NFR-5 | Simple deployment via Docker Compose on one server. |

## 11. Models for this PoC

GPT-5.4, Claude Sonnet 5, Gemini 3.1 Pro, GPT-5 Mini, Gemini 3 Flash, DeepSeek-V4-Pro. Exact OpenRouter slugs are verified during implementation (see `backend/docs/BACKEND_ARCHITECTURE.md §9`).

## 12. Milestones

| # | Milestone | Owner |
|---|---|---|
| M0 | Contract frozen (`API_CONTRACT.md` v1) | Vahid |
| M1 | Backend core: auth, sessions, LLM gateway, tracing, architectures A and B, guard, config loading, tests | Backend coder (Claude Code) |
| M1' | Frontend against a mock API (parallel with M1) | Frontend coder (freebuff + DeepSeek V4 Flash) |
| M2 | Integration + model smoke test (each model must produce valid JSON in both architectures) | Both |
| M3 | Internal QA: Vahid runs about 10 role-play cases and prompts are tuned | Vahid |
| M4 | Physician evaluation period | Physicians |
| M5 | Decision report: best architecture/method/model, and input for the rebuild | Vahid |

## 13. Open questions (not blocking)

- Which agents are enabled first. Recommendation: B × 6 models + A × {Sonnet 5, GPT-5.4} = 8 agents.
- The deployment host and domain.
