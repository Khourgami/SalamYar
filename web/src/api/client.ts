/**
 * HTTP client for `/api/v1`.
 *
 * Responsibilities:
 * - prefix `VITE_API_BASE_URL` and attach `Authorization: Bearer <token>`;
 * - parse JSON and turn every non-2xx response into an `ApiError` that keeps the full body
 *   (the 502 `AGENT_ERROR` body carries `patient_message` / `agent_message` that the chat needs);
 * - 30 s default timeout, 90 s for the two long-running session endpoints;
 * - clear the stored auth and redirect to `/login` on a 401 (except for login itself).
 */

import type { AgentErrorBody, ApiErrorBody } from '@/api/types'

export const TOKEN_STORAGE_KEY = 'triage_lab_token'
export const USER_STORAGE_KEY = 'triage_lab_user'

/** Fired whenever the stored auth is cleared (logout, or a 401 from any endpoint). */
export const AUTH_CLEARED_EVENT = 'triage-lab:auth-cleared'

export const DEFAULT_TIMEOUT_MS = 30_000
export const LONG_TIMEOUT_MS = 90_000

export const LOGIN_PATH = '/login'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiFetchOptions {
  method?: HttpMethod
  body?: unknown
  timeoutMs?: number
  /** Send no `Authorization` header even when a token is stored. */
  omitAuth?: boolean
  /** Do not treat a 401 as "the session expired" (used by `POST /auth/login`). */
  allowUnauthorized?: boolean
  headers?: Record<string, string>
}

/** Error thrown for every failed request. `status === 0` means a network/timeout failure. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** The full parsed JSON body, when there was one. */
  readonly body: unknown

  constructor(status: number, code: string, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }

  /** Narrows the 502 `AGENT_ERROR` body so the chat can show both messages and offer a resend. */
  get agentErrorBody(): AgentErrorBody | null {
    return this.code === 'AGENT_ERROR' ? (this.body as AgentErrorBody) : null
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/* ------------------------------------------------------------------ *
 * Auth storage
 * ------------------------------------------------------------------ */

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function readStoredUser<T = unknown>(): T | null {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeStoredAuth(token: string, user: unknown): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } catch {
    /* storage can be unavailable (private mode); the app still works for the current page */
  }
}

export function clearStoredAuth(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    window.localStorage.removeItem(USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(AUTH_CLEARED_EVENT))
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * URL + headers
 * ------------------------------------------------------------------ */

export function apiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  return base.replace(/\/+$/, '')
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

function buildHeaders(options: ApiFetchOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (!options.omitAuth) {
    const token = readStoredToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/* ------------------------------------------------------------------ *
 * Core request
 * ------------------------------------------------------------------ */

function extractError(body: unknown, status: number): { code: string; message: string } {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as ApiErrorBody).error
    if (error && typeof error === 'object') {
      return {
        code: typeof error.code === 'string' ? error.code : `HTTP_${status}`,
        message:
          typeof error.message === 'string'
            ? error.message
            : `Request failed with status ${status}`,
      }
    }
  }
  return { code: `HTTP_${status}`, message: `Request failed with status ${status}` }
}

async function parseBody(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function handleUnauthorized(options: ApiFetchOptions): void {
  if (options.allowUnauthorized) return
  clearStoredAuth()
  window.location.assign(LOGIN_PATH)
}

/**
 * Perform a request and throw `ApiError` on any non-2xx response.
 *
 * @throws ApiError when the response is not 2xx, or when the request fails / times out
 *   (`status: 0`, `code: "NETWORK_ERROR"`).
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiFetchRaw(path, options)
  if (response.status === 204) return undefined as T
  return (await parseBody(response)) as T
}

/**
 * Same as `apiFetch` but returns the raw `Response` instead of parsed JSON.
 * Used for the CSV export, which needs the auth header and produces a Blob.
 */
export async function apiFetchRaw(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: buildHeaders(options),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      timedOut ? 'The request timed out.' : 'The network request failed.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const parsed = await parseBody(response)
    const { code, message } = extractError(parsed, response.status)
    if (response.status === 401) handleUnauthorized(options)
    throw new ApiError(response.status, code, message, parsed)
  }

  return response
}

/** Trigger a browser download for an in-memory Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
