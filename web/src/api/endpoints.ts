/**
 * One typed function per endpoint of `../../docs/API_CONTRACT.md` v1.
 * No ad-hoc fetch calls anywhere else in the app.
 */

import {
  LONG_TIMEOUT_MS,
  apiFetch,
  apiFetchRaw,
  buildQuery,
  downloadBlob,
} from '@/api/client'
import type {
  AdminSessionListResponse,
  AgentPublic,
  CreateSessionRequest,
  Evaluation,
  EvaluationInput,
  ExportTable,
  Feedback,
  FeedbackInput,
  LoginRequest,
  LoginResponse,
  MetricsGroupBy,
  MetricsResponse,
  ReloadResponse,
  SessionDetail,
  SessionListResponse,
  SessionStatus,
  TurnResponse,
  User,
} from '@/api/types'

/* ------------------------------- auth ------------------------------ */

/** `POST /auth/login` — a 401 here means "wrong credentials", not "session expired". */
export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: input,
    allowUnauthorized: true,
  })
}

/** `GET /auth/me` */
export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me')
}

/* ------------------------------ agents ----------------------------- */

/** `GET /agents` — enabled agents only, in a stable per-user shuffled order. */
export function listAgents(): Promise<AgentPublic[]> {
  return apiFetch<AgentPublic[]>('/agents')
}

/* ----------------------------- sessions ---------------------------- */

/** `POST /sessions` — returns the session with its greeting message. No LLM call. */
export function createSession(input: CreateSessionRequest): Promise<SessionDetail> {
  return apiFetch<SessionDetail>('/sessions', { method: 'POST', body: input })
}

export interface ListSessionsParams {
  status?: SessionStatus
  evaluated?: boolean
  limit?: number
  offset?: number
}

/** `GET /sessions` — the current user's sessions. */
export function listSessions(params: ListSessionsParams = {}): Promise<SessionListResponse> {
  return apiFetch<SessionListResponse>(`/sessions${buildQuery({ ...params })}`)
}

/** `GET /sessions/{id}` */
export function getSession(sessionId: string): Promise<SessionDetail> {
  return apiFetch<SessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`)
}

/** `POST /sessions/{id}/messages` — may take 5–30 s, hence the 90 s timeout. */
export function postMessage(sessionId: string, text: string): Promise<TurnResponse> {
  return apiFetch<TurnResponse>(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: { text },
    timeoutMs: LONG_TIMEOUT_MS,
  })
}

/** `POST /sessions/{id}/finish` — the agent concludes from what it already knows. */
export function finishSession(sessionId: string): Promise<TurnResponse> {
  return apiFetch<TurnResponse>(`/sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: 'POST',
    body: {},
    timeoutMs: LONG_TIMEOUT_MS,
  })
}

/* ---------------------- feedback and evaluation -------------------- */

/** `PUT /messages/{message_id}/feedback` */
export function putFeedback(messageId: string, input: FeedbackInput): Promise<Feedback> {
  return apiFetch<Feedback>(`/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: 'PUT',
    body: input,
  })
}

/** `DELETE /messages/{message_id}/feedback` — 409 `EVALUATION_LOCKED` after evaluation. */
export function deleteFeedback(messageId: string): Promise<void> {
  return apiFetch<void>(`/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: 'DELETE',
  })
}

/** `POST /sessions/{id}/evaluation` */
export function submitEvaluation(
  sessionId: string,
  input: EvaluationInput,
): Promise<Evaluation> {
  return apiFetch<Evaluation>(`/sessions/${encodeURIComponent(sessionId)}/evaluation`, {
    method: 'POST',
    body: input,
  })
}

/* ------------------------------ admin ------------------------------ */

export interface AdminListSessionsParams {
  agent_id?: string
  user_id?: string
  status?: SessionStatus
  evaluated?: boolean
  limit?: number
  offset?: number
}

/** `GET /admin/sessions` */
export function adminListSessions(
  params: AdminListSessionsParams = {},
): Promise<AdminSessionListResponse> {
  return apiFetch<AdminSessionListResponse>(`/admin/sessions${buildQuery({ ...params })}`)
}

/** `GET /admin/sessions/{id}` — `reveal` is always present, feedback from all users. */
export function adminGetSession(sessionId: string): Promise<SessionDetail> {
  return apiFetch<SessionDetail>(`/admin/sessions/${encodeURIComponent(sessionId)}`)
}

/** `GET /admin/metrics` */
export function adminMetrics(groupBy: MetricsGroupBy = 'agent'): Promise<MetricsResponse> {
  return apiFetch<MetricsResponse>(`/admin/metrics${buildQuery({ group_by: groupBy })}`)
}

/** Pure URL builder for `GET /admin/export/{table}.csv` (relative, so the dev proxy applies). */
export function adminExportUrl(table: ExportTable): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  return `${base.replace(/\/+$/, '')}/admin/export/${table}.csv`
}

/**
 * `GET /admin/export/{table}.csv` downloaded as a Blob.
 *
 * The endpoint needs the `Authorization` header, so a plain `<a href>` cannot be used.
 */
export async function downloadAdminExport(table: ExportTable): Promise<void> {
  const response = await apiFetchRaw(`/admin/export/${table}.csv`, { timeoutMs: LONG_TIMEOUT_MS })
  const blob = await response.blob()
  downloadBlob(blob, `${table}.csv`)
}

/** `POST /admin/agents/reload` */
export function reloadAgents(): Promise<ReloadResponse> {
  return apiFetch<ReloadResponse>('/admin/agents/reload', { method: 'POST', body: {} })
}
