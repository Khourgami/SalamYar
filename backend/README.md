# AI Triage Agent Lab — Backend

FastAPI + SQLite backend for the triage agent lab (PoC). It implements `../docs/API_CONTRACT.md` v1,
the agent framework, architectures A (`simple`) and B (`structured`), the deterministic guard,
LLM tracing, admin metrics, and CSV export. Design: `docs/BACKEND_ARCHITECTURE.md`,
`docs/AGENT_SPEC.md`. Decisions: `docs/decisions.md`. Status: `docs/progress.md`.

## Setup

```bash
uv sync                      # Python 3.12 + all dependencies
cp .env.example .env         # then set OPENROUTER_API_KEY and JWT_SECRET
```

All settings are listed in `.env.example` (BACKEND_ARCHITECTURE §13).

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000   # API at http://localhost:8000/api/v1, docs at /docs
```

## Dev server (offline, for web integration)

`app.dev_server` runs the real API (auth, sessions, registry, DB) with the offline `DemoLLM`
instead of OpenRouter: no key, no cost (D-029). It needs no `.env`: when `OPENROUTER_API_KEY` or
`JWT_SECRET` is missing it fills a placeholder key and a fixed dev-only JWT secret.

```powershell
uv run python -m app.dev_server --seed                   # http://127.0.0.1:8000/api/v1, DB data/dev.db
uv run python -m app.dev_server --seed --delay-ms 0      # no simulated latency
uv run python -m app.dev_server --db data/dev2.db --port 8001
```

| Option | Default | Meaning |
|---|---|---|
| `--db PATH` | `data/dev.db` | SQLite file. `data/lab.db` is refused. |
| `--seed` | off | Creates the demo users below if the username does not exist yet (never overwrites a password). |
| `--delay-ms N` | `1500` | Async sleep per LLM call, so the typing indicator and 409 `TURN_IN_PROGRESS` can be observed. A structured conclusion makes two calls (2 × N). |
| `--host`, `--port` | `127.0.0.1`, `8000` | |

On start-up it prints the URL, the database path, and the seeded usernames. Seeded users (dev
only, same as the web mocks):

| username | password | role | display name |
|---|---|---|---|
| `doctor` | `doctor123` | evaluator | «دکتر آزمایشی» |
| `doctor2` | `doctor123` | evaluator | «دکتر آزمایشی ۲» |
| `admin` | `admin123` | admin | «مدیر» |

Demo behavior: the agent asks twice (simple) or once (structured) and then concludes.
**Failure trigger:** the first time a turn is processed whose last patient message contains
«خطا», every attempt (including the repair retry) returns invalid JSON, so the request ends in
502 `AGENT_ERROR` and the session stays active. Resending the identical text is answered normally,
and the patient message is reused, not duplicated. The trigger fires once per session and
transcript.

## CLI

```bash
uv run python -m app.cli create-user --username dr.x --display-name "دکتر ..." --role evaluator   # prompts for password (≥ 8 chars)
uv run python -m app.cli create-user --username qa --display-name "QA" --role evaluator --password-stdin
uv run python -m app.cli list-agents
uv run python -m app.cli smoke-test [--agent ID] [--include-disabled]    # real OpenRouter calls, costs a few cents
```

`--password-stdin` reads the password from the first line of stdin instead of prompting. The rules
are the same: at least 8 characters, no duplicate username. PowerShell:

```powershell
"secret123" | uv run python -m app.cli create-user --username qa --display-name "QA" --role evaluator --password-stdin
```

`smoke-test` checks every selected agent's model slug against `GET /models`, runs a scripted
two-message conversation plus a forced conclusion through the real architectures, prints a table,
and exits non-zero if any agent fails.

## Agents

Agents are declared in `config/agents.yaml` (`defaults` + one entry per agent; any default can be
overridden per agent, including nested `options`; `send_temperature: false` omits temperature).
Reload without restarting via `POST /api/v1/admin/agents/reload` (an invalid file keeps the previous
config). Running sessions always use the config snapshot taken when they started.

## Test and lint

```bash
uv run pytest -q                       # no network; the LLM is faked
uv run pytest -q --cov=app --cov-branch
uv run pytest -q tests/test_guard.py --cov=app.agents.guard --cov-branch --cov-fail-under=100
uv run ruff check . && uv run ruff format .
```

## Docker Compose (whole app, port 80)

The root `../docker-compose.yml` runs two services: `backend` (this image; env from
`backend/.env`; `backend/data` mounted at `/app/data`; port 8000 not published) and `web`
(nginx serves the SPA on port 80 and proxies `/api` to `backend:8000`). Run it from the
repository root:

```powershell
docker compose up --build -d          # http://localhost/  and  http://localhost/api/v1
docker compose logs -f backend
docker compose restart backend        # users and sessions persist in backend/data/lab.db
docker compose down
```

Create a user inside the running backend container. Plain `python` in the slim image is the
system interpreter without the dependencies, so use `uv run`, and use `-T` so stdin is piped:

```powershell
"secret123" | docker compose exec -T backend uv run python -m app.cli create-user --username dr.x --display-name "دکتر ..." --role evaluator --password-stdin
```

Single container without compose:

```bash
docker build -t triage-backend .
docker run -p 8000:8000 --env-file .env -v "$(pwd)/data:/app/data" triage-backend
```

## Layout

```
app/
  main.py, settings.py, errors.py, startup.py, cli.py, smoke.py, dev_server.py
  api/        routers (auth, agents, sessions, evaluations, admin)
  services/   session, evaluation, metrics, export, user services
  agents/     registry, config, base, clinical_schemas, guard, json_runner, texts_fa,
              architectures/{simple,structured}.py, prompts/v1/*.md
  llm/        client protocol, OpenRouterClient, FakeLLM (tests), DemoLLM (dev server)
  db/         SQLAlchemy models, engine, column types
config/agents.yaml
tests/
```

## Git

One repository at the project root (D-027). Stage and commit only backend paths, e.g.
`git add -- backend docker-compose.yml` and `git commit -m "backend: ..." -- backend docker-compose.yml`
(the web coder shares the index). Never commit `.env` or `data/`.
