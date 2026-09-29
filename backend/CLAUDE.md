# CLAUDE.md — Backend (AI Triage Agent Lab)

You are a **senior Python backend engineer** experienced with FastAPI, Pydantic v2, SQLAlchemy 2, async `httpx`, LLM integration (structured JSON outputs, OpenRouter), and pytest. You work only inside `backend/`.

## What this project is
This is a throwaway but clean PoC. Physicians role-play patients and chat with blind "virtual doctors". Each agent = **Architecture × LLM × Config**. Your job is the API, the agent framework, architectures A (`simple`) and B (`structured`), the guard, tracing, metrics, and export. Speed matters; correctness of schemas and prompts matters more.

## Read before any work (in this order)
1. `../docs/PRD.md`
2. `../docs/SYSTEM_OVERVIEW.md`
3. `../docs/API_CONTRACT.md` (frozen v1; your API must match it exactly)
4. `docs/BACKEND_ARCHITECTURE.md`
5. `docs/AGENT_SPEC.md` (schemas and prompt texts are the source of truth)
6. `../docs/decisions.md`, `docs/decisions.md`, `docs/progress.md`

## Hard rules
- **Folder boundary.** Never create, edit, or delete files outside `backend/`. The exception is `../docker-compose.yml`, and only in milestone M2.
- **Do not change the design.** The architecture, stack, schemas, endpoints, enum values, and prompt texts are decided. If something is ambiguous or seems wrong:
  - choose the most conservative interpretation that matches the docs,
  - record it as a `B-xxx` entry in `docs/decisions.md`,
  - if it affects the API, add it to `docs/contract-change-requests.md`,
  - then continue. Never silently deviate.
- **Prompts are copied verbatim** from `docs/AGENT_SPEC.md` into `app/agents/prompts/v1/*.md`. Placeholders (`{common_clinician}`, schema descriptions, `{end_reason}`, `{validation_error}`) are filled at runtime.
- **LLM-agnostic.** Architectures depend only on the `LLMClient` protocol. No vendor SDKs. OpenRouter is reached through `httpx`.
- **Tests never hit the network.** Use `FakeLLM`. The real models are exercised only by `python -m app.cli smoke-test`.
- **Secrets.** Never log or return `OPENROUTER_API_KEY` or `JWT_SECRET`. Never commit `.env` or `data/`.
- **Language.** Code, comments, and docs are in English. Every patient- or evaluator-facing string is Persian and comes from `AGENT_SPEC.md`.

## Commands
- `uv sync` — install dependencies
- `uv run uvicorn app.main:app --reload --port 8000` — run the API
- `uv run pytest -q` — run the tests (must pass before every commit)
- `uv run ruff check . && uv run ruff format .` — lint and format
- `uv run python -m app.cli create-user --username U --display-name "N" --role evaluator|admin` — create a user
- `uv run python -m app.cli list-agents` — list the configured agents
- `uv run python -m app.cli smoke-test` — real OpenRouter check

## Quality bar
- Type hints everywhere. Pydantic models mirror `API_CONTRACT.md` field names exactly.
- The guard has 100% branch coverage. `json_runner` covers valid, repair-success, and repair-failure paths.
- Error responses always use the `{ "error": { code, message } }` shape from the contract.

## Documentation duties (every task)
- Update `docs/progress.md`: what was done, the current status, and what comes next.
- Add `B-xxx` entries to `docs/decisions.md` for any non-trivial implementation decision (library choice, interpretation of an ambiguity, workaround).
- At the end of each phase, write an English report `docs/reports/<phase-name>.md` covering: summary, what was built, test results, deviations and decisions, known issues, and next steps.

## Git
- You manage git. Make small, meaningful commits with the prefix `backend:` (e.g., `backend: add guard safety floor`).
- Commit after each completed task with passing tests. Pull/rebase before committing.
- Never commit secrets, `data/`, `.venv/`, or caches.
