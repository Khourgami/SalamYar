# Triage Lab — Web (`web/`)

Persian (RTL) React 18 frontend for the AI Triage Agent Lab PoC. It is built against the frozen
`../../docs/API_CONTRACT.md` v1 and runs fully on MSW mocks while the backend is developed in parallel.

## Requirements

- Node.js 20+ (developed on Node 24)
- npm

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at http://localhost:5173 (proxies `/api` → http://localhost:8000) |
| `npm run build` | Type-check (`tsc -b`) + production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | ESLint (flat config, zero warnings policy) |
| `npm run test` | Vitest + React Testing Library (single run) |
| `npm run test:watch` | Vitest in watch mode |

## Environment

Copy `.env.example` to `.env`:

```
VITE_API_BASE_URL=/api/v1
VITE_USE_MOCKS=true
```

- `VITE_API_BASE_URL` is always relative (`/api/v1`). Vite proxies it in development and nginx
  proxies it in the container.
- `VITE_USE_MOCKS=true` starts the MSW worker in `src/main.tsx` and intercepts every `/api/v1`
  request, so the app is fully usable without the backend. Set it to `false` to talk to the real
  backend. No secret ever lives in the frontend.
- Browser mocks need `public/mockServiceWorker.js` (committed). If it is ever missing,
  `npm run dev` logs an MSW error and the app boots without mocks instead of going blank —
  regenerate the file with `npx msw init public/ --save`.

Mock users:

| username | password | role |
|---|---|---|
| `doctor` | `doctor123` | evaluator |
| `admin` | `admin123` | admin |

## Mock mode

- 8 blind "virtual doctors" (`دکتر ۱` … `دکتر ۸`). Agent ids, architectures and models are hidden
  until the evaluation is submitted.
- `POST /sessions/{id}/messages` answers after a random 3–6 s delay; the 5th patient message makes
  the agent conclude with a full result card.
- Sending a message that contains `خطا` returns the 502 `AGENT_ERROR` body so the error + resend
  path can be exercised.

## Docker

```
docker build -t triage-web .
docker run --rm -p 8080:80 --network <your-network> triage-web
```

Two stages: `node:20-alpine` installs with `npm ci` and runs `npm run build` (so a TypeScript error
fails the image build) with `VITE_USE_MOCKS=false`, then `nginx:1.27-alpine` serves `dist/`.
The mock worker is stripped from the image — this artifact never mocks.

nginx serves the SPA with a fallback to `index.html` and proxies `/api/` to the API with a 120 s
read timeout (agent turns may take up to 90 s).

| Setting | Default | Notes |
|---|---|---|
| `API_UPSTREAM` | `http://backend:8000` | Upstream host, substituted at container start — no rebuild needed |

```
docker run --rm -p 8080:80 -e API_UPSTREAM=http://api.internal:8000 triage-web
```

The upstream is resolved per request, so the container starts and stays healthy even when the
backend is not up yet (it answers `502` for `/api/` until the name resolves). Name the backend
service `backend` on the same user-defined network, or set `API_UPSTREAM` to its address.

## Layout

```
public/
└─ mockServiceWorker.js   MSW browser worker (dev only; not shipped in the image)
src/
├─ api/        typed client + endpoints + types (mirrors API_CONTRACT.md)
├─ mocks/      MSW handlers, in-memory store and fixtures
├─ i18n/       Persian enum labels + all static UI text (ZWNJ written as \u200c)
├─ lib/        formatting helpers (Persian digits, percent, Jalali date, USD)
├─ auth/       auth context (token + user in localStorage)
├─ app/        router + query client
├─ components/ shared UI, session components, admin table
├─ pages/      route pages
└─ App.tsx     router + providers
```

## Tests

`npm run test` runs Vitest + React Testing Library against `msw/node` (128 tests): the API client
(auth header, `ApiError` + 502 body, timeout, 401 logout), every mock handler, the Persian label
maps and formatters, the shell and route guards, the doctors list, the chat states (send, typing,
disabled, 409, 502 + resend, finish, feedback), the result card with and without the safety-floor
escalation, the backstage panel, the evaluation form validation and reveal, the history table and
tabs, and the admin pages (sorting, group-by refetch, CSV download, reload toast).

## Docs

- `docs/UI_SPEC.md` — pages, flows and all Persian texts (source of truth for the UI)
- `docs/decisions.md` — `W-xxx` implementation decisions
- `docs/progress.md` — task-level progress
- `docs/contract-questions.md` — open questions for the product owner
- `docs/reports/` — phase reports
