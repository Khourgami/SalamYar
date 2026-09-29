# Decisions Log

Format: ID · date · decision · rationale · status. New decisions are appended; superseded ones are marked, never deleted.

| ID | Date | Decision | Rationale | Status |
|---|---|---|---|---|
| D-001 | 2026-09-29 | An agent is defined as Architecture × LLM × Config. Architectures are LLM-agnostic, and agents are declared in `agents/agents.yaml`. | Allows fair comparison and new agents without code changes. | Accepted |
| D-002 | 2026-09-29 | The PoC is a throwaway demo optimized for speed. The product will be rebuilt after the results are reviewed. | The goal is to find the best architecture, method, and model quickly. | Accepted |
| D-003 | 2026-09-29 | Backend: Python 3.12 + FastAPI + Pydantic v2 + SQLite (SQLAlchemy, no migrations). | Fast to build; Python keeps the door open for local models; SQLite is enough for a few evaluators. | Accepted |
| D-004 | 2026-09-29 | Only two architectures: A `simple` (1 call per turn) and B `structured` (1 call per turn + 1 final call). The panel, ensembles, and critic pass are deferred. | Demo speed and cost. B tests the value of structured reasoning cheaply. | Accepted |
| D-005 | 2026-09-29 | No clinical rules, red flags, or knowledge base in the PoC. The safety floor is an LLM-estimated `emergency_probability` ≥ threshold (default 0.20) → `EMERGENCY_NOW`. It is toggleable per agent, and raw and final triage levels are both stored. | The physicians will define clinical rules after seeing the PoC output. Storing both levels makes the effect of the floor measurable. | Accepted |
| D-006 | 2026-09-29 | Synchronous request/response per turn; no streaming. | The output is JSON that must be validated before it is shown. Simpler. | Accepted |
| D-007 | 2026-09-29 | Agents are blind (neutral display names, shuffled order per user). Architecture and model are revealed only after the evaluation is submitted. | Avoids evaluator bias. | Accepted |
| D-008 | 2026-09-29 | Backstage reasoning is shown only after the session is completed. | Seeing the reasoning mid-chat would influence how the evaluator role-plays. | Accepted |
| D-009 | 2026-09-29 | OpenRouter with `provider.data_collection = "deny"` and `usage.include = true`. `base_url` is configurable. | Privacy, cost tracking, and future local models. | Accepted |
| D-010 | 2026-09-29 | The evaluator's own verdict (triage level, specialty) is collected in the post-session form and is the reference for automatic triage and specialty metrics. There is no pre-session case card or scenario bank. | The physicians role-play freely; nothing is given to the agent. | Accepted |
| D-011 | 2026-09-29 | Frontend and backend are developed in parallel against the frozen `API_CONTRACT.md` v1. Frontend by DeepSeek V4.1 Flash with MSW mocks; backend and agents by Claude Opus 5.5. | Speed. Agent prompts and schemas are the core of the PoC and get the strongest coder. | Accepted |
| D-012 | 2026-09-29 | PoC models: GPT-5.4, Claude Sonnet 5, Gemini 3.1 Pro, GPT-5 Mini, Gemini 3 Flash, DeepSeek-V4-Pro. Initially enabled: B × 6 + A × {Sonnet 5, GPT-5.4}. | Product owner choice; the initial set limits evaluator load. | Accepted |
| D-013 | 2026-09-29 | Docs, code, prompts, and reports are in English. All patient- and evaluator-facing text is Persian. | AI coders work best in English; the users are Persian speakers. | Accepted |
| D-014 | 2026-09-29 | No minimum question count. There is a hard cap `max_questions` (default 12), and the agent follows a stop policy. | Efficiency is a KPI; a minimum forces useless questions. | Accepted |
