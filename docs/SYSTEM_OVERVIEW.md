# System Overview — AI Triage Agent Lab (PoC)

**Status:** v1.0
**Owner:** root `docs/` is maintained by product/architecture (Vahid + Claude chat). Coders read it but never edit it.

---

## 1. What we are building

A web app in which physicians log in, pick a blind "virtual doctor" (an agent), and role-play a patient. Each agent is **Architecture × LLM × Config**. Physicians evaluate every conversation, and the admin compares agents on a dashboard. See `PRD.md`.

## 2. System diagram

```
┌──────────────┐   /api/v1 (API_CONTRACT.md)   ┌───────────────┐   HTTPS   ┌────────────┐
│  web/        │ ────────────────────────────▶ │  backend/     │ ────────▶ │ OpenRouter │
│  React SPA   │ ◀──────────────────────────── │  FastAPI      │           │ (6 LLMs)   │
│  (nginx)     │                               │  SQLite       │           └────────────┘
└──────────────┘                               └───────────────┘
```

## 3. Repository layout and ownership

```
/
├─ README.md
├─ docker-compose.yml          # owned by backend coder (created in M2)
├─ docs/                       # SHARED docs — owner: Vahid + Claude chat
│  ├─ PRD.md
│  ├─ SYSTEM_OVERVIEW.md
│  ├─ API_CONTRACT.md          # frozen v1; changes only via decisions.md
│  ├─ decisions.md             # cross-cutting decisions (D-xxx)
│  ├─ progress.md              # milestone-level status
│  └─ reports/                 # integration / milestone reports
├─ backend/                    # owner: backend coder (Claude Code)
│  ├─ CLAUDE.md
│  └─ docs/                    # BACKEND_ARCHITECTURE, AGENT_SPEC (spec owned by product),
│                              # decisions (B-xxx), progress, contract-change-requests, reports/
└─ web/                        # owner: frontend coder (freebuff + DeepSeek V4 Flash)
   ├─ AGENTS.md
   └─ docs/                    # UI_SPEC (spec owned by product), decisions (W-xxx), progress,
                               # contract-questions, reports/
```

### Ownership rules

| Location | Who writes | Who reads |
|---|---|---|
| `docs/*` | Vahid + Claude chat only | everyone |
| `backend/docs/BACKEND_ARCHITECTURE.md`, `backend/docs/AGENT_SPEC.md` | Vahid + Claude chat (the coder may fix typos only) | backend coder |
| `web/docs/UI_SPEC.md` | Vahid + Claude chat | frontend coder |
| `backend/**` (everything else) | backend coder | — |
| `web/**` (everything else) | frontend coder | — |

- A coder never edits files outside its own project folder.
- **Contract changes.** A coder that needs something different from `API_CONTRACT.md` writes it in `backend/docs/contract-change-requests.md` or `web/docs/contract-questions.md`, then continues with the contract as written. Vahid brings the request to the product side; if it is accepted, the contract is bumped (v1.x) and a `D-xxx` decision is logged.
- **Decision IDs.** `D-xxx` for root/cross-cutting decisions, `B-xxx` for backend, `W-xxx` for web.

## 4. Local development

| Service | Command (from its folder) | URL |
|---|---|---|
| backend | `uv run uvicorn app.main:app --reload --port 8000` | http://localhost:8000/api/v1 |
| web (mock) | `npm run dev` with `VITE_USE_MOCKS=true` | http://localhost:5173 |
| web (real API) | `npm run dev` with `VITE_USE_MOCKS=false` (Vite proxies `/api` to :8000) | http://localhost:5173 |

## 5. Deployment (M2)

- `docker-compose.yml` at the root has two services:
  - `backend`: builds `backend/Dockerfile`, env from `backend/.env`, volume for `backend/data`;
  - `web`: builds `web/Dockerfile`; nginx serves the SPA and proxies `/api` to `backend:8000`. Port 80 is exposed.
- HTTPS is terminated by the host's reverse proxy.

## 6. Git workflow

- One repository and one `main` branch. Each coder commits only inside its own folder, with commit prefixes `backend:` / `web:`.
- Pull/rebase before committing. Small, frequent commits with meaningful messages.
- Never commit `.env`, `backend/data/`, `node_modules/`, or `dist/`.

## 7. Integration checklist (M2)

1. Backend passes its tests. `smoke-test` passes for all enabled agents.
2. Web runs with `VITE_USE_MOCKS=false` against the local backend. The full flow works for both a simple and a structured agent.
3. Error paths are verified: 401 redirect, 409 turn in progress, 502 agent error + resend.
4. `docker compose up --build` serves the whole app on port 80.
5. An integration report is written to `docs/reports/M2-integration.md` (by Vahid/Claude chat, from both coders' reports).
