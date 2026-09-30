# Contract Questions (web → product)

Use this file when `../../docs/API_CONTRACT.md` or `UI_SPEC.md` is unclear or missing something. Keep building with the most conservative assumption and record it as a `W-xxx` decision.

**Phase 3 (integration, 2026-09-30):** the contract-conformance suite (T2, 35 scenarios) and the
browser pass (T3) raised **no new questions** and needed **no `backend-issue` row**. Every key set,
enum, status and error code matched `API_CONTRACT.md` v1.1 as built.

| # | Date | Doc & section | Question | Assumption used meanwhile | Status (open/answered) |
| Q-1 | 2026-09-29 | `API_CONTRACT §5` + `UI_SPEC §2` | `GET /sessions` returns only the current user's sessions and admin access is via `/admin/sessions`, but `UI_SPEC §2` grants `/history` to both roles. Should an admin's "سوابق من" list only the admin's own sessions? | `/history` uses `GET /sessions` for every role, so an admin sees only their own sessions there and the full list on `/admin/sessions`. | answered (D-020) — `GET /sessions` returns the caller's own sessions for every role, admins included; an admin's full list lives on `/admin/sessions`. |
| Q-2 | 2026-09-29 | `API_CONTRACT §6` | `PUT /messages/{id}/feedback` is described as "agent messages only" but does not say whether an admin may leave feedback on another user's session, nor which user's feedback the sessional score uses. | Any authenticated user with access to the session may put/delete their *own* feedback; the admin session detail shows all users' feedback read-only (after evaluation). Metrics count all feedback rows. | answered (D-020) — every §5/§6 endpoint is owner-only for every role (admins included, 403 otherwise); the admin reads other users' sessions read-only via `/admin/sessions/{id}`. |
| Q-3 | 2026-09-29 | `API_CONTRACT §2` | `SessionSummary.final_triage_level` is not explicit about the raw-vs-final distinction from the guard. | The final (post-guard) triage level is used in every list and badge. | answered (D-021) — every list, badge and metric uses the final (post-guard) level. |
| Q-4 | 2026-09-29 | `UI_SPEC §3.3` | The mini hypothesis table in the backstage panel needs a `name_fa`/`name_en`/`probability` projection; the spec says "name + %" only. | The mini table shows `name_fa` with `name_en` in small gray text and the probability as a Persian percentage, consistent with the differential table. | answered (D-021) — the mini table shows `name_fa`, a small `name_en`, and a Persian percentage, like the differential table. |
