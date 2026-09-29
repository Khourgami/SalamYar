# Contract Change Requests (backend → product)

Use this file when `../../docs/API_CONTRACT.md` blocks or conflicts with the implementation. Keep implementing the contract as written until a request is accepted.

| # | Date | Contract section | Problem | Proposed change | Status (open/accepted/rejected) |
|---|---|---|---|---|---|
| 1 | 2026-09-30 | §1 Errors, §6 `POST /sessions/{id}/evaluation` | A second evaluation of the same session returns 409 with code `VALIDATION_ERROR` (as instructed by the phase prompt). A 409 carrying a 400-style code is ambiguous for clients that switch on `code`. | Add a dedicated code, e.g. 409 `ALREADY_EVALUATED`. Implemented as-is until decided. | accepted — resolved with EVALUATION_LOCKED instead of ALREADY_EVALUATED (D-018) |
| 2 | 2026-09-30 | §1 Errors | No code is defined for HTTP 405 (wrong method on an existing route). The backend returns 405 `METHOD_NOT_ALLOWED` in the standard error shape (B-003). | Add `METHOD_NOT_ALLOWED` to the error table (low priority; only reachable by client bugs). | accepted (D-019) |
