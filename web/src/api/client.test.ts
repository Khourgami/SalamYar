import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  LOGIN_PATH,
  USER_STORAGE_KEY,
  apiBaseUrl,
  apiFetch,
  buildQuery,
  clearStoredAuth,
  readStoredToken,
  writeStoredAuth,
} from '@/api/client'
import { jsonResponse } from '@/test/fetchMock'
import type { AgentErrorBody } from '@/api/types'

const agentErrorBody: AgentErrorBody = {
  error: { code: 'AGENT_ERROR', message: 'Upstream LLM failed after retries.' },
  patient_message: {
    id: 'm-1',
    seq: 1,
    role: 'patient',
    kind: 'text',
    text: 'از دیروز دل‌درد دارم',
    created_at: '2026-09-29T10:00:00Z',
    latency_ms: null,
  },
  agent_message: {
    id: 'm-2',
    seq: 2,
    role: 'agent',
    kind: 'error',
    text: 'ERROR_FA',
    created_at: '2026-09-29T10:00:05Z',
    latency_ms: null,
  },
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiFetch', () => {
  it('prefixes the API base URL and attaches the bearer token', async () => {
    writeStoredAuth('mock-token-doctor', { id: 'u1', role: 'evaluator' })
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }))

    const result = await apiFetch<{ ok: boolean }>('/agents')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${apiBaseUrl()}/agents`)
    expect(url).toBe('/api/v1/agents')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer mock-token-doctor')
    expect(headers.Accept).toBe('application/json')
    expect(init.method).toBe('GET')
  })

  it('omits the Authorization header when there is no token or auth is disabled', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}))
    await apiFetch('/agents')
    let headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()

    writeStoredAuth('tok', {})
    await apiFetch('/agents', { omitAuth: true })
    headers = fetchMock.mock.calls[1][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('serialises the body and sets the JSON content type', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}, 201))

    await apiFetch('/sessions', { method: 'POST', body: { agent_id: 'b-sonnet5' } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ agent_id: 'b-sonnet5' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('application/json')
  })

  it('returns undefined for 204 responses', async () => {
    stubFetch(async () => jsonResponse(undefined, 204))

    await expect(apiFetch('/messages/m1/feedback', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  describe('errors', () => {
    it('throws an ApiError carrying status, code, message and body', async () => {
      stubFetch(async () =>
        jsonResponse({ error: { code: 'TURN_IN_PROGRESS', message: 'A turn is running.' } }, 409),
      )

      const error = await apiFetch('/sessions/s1/messages', {
        method: 'POST',
        body: { text: 'hi' },
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ApiError)
      const apiError = error as ApiError
      expect(apiError.status).toBe(409)
      expect(apiError.code).toBe('TURN_IN_PROGRESS')
      expect(apiError.message).toBe('A turn is running.')
      expect(apiError.body).toEqual({
        error: { code: 'TURN_IN_PROGRESS', message: 'A turn is running.' },
      })
    })

    it('keeps the full 502 AGENT_ERROR body so the chat can resend', async () => {
      stubFetch(async () => jsonResponse(agentErrorBody, 502))

      const error = (await apiFetch('/sessions/s1/messages', {
        method: 'POST',
        body: { text: 'از دیروز دل‌درد دارم' },
      }).catch((caught: unknown) => caught)) as ApiError

      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(502)
      expect(error.code).toBe('AGENT_ERROR')
      expect(error.body).toEqual(agentErrorBody)
      expect(error.agentErrorBody?.patient_message.text).toBe('از دیروز دل‌درد دارم')
      expect(error.agentErrorBody?.agent_message.kind).toBe('error')
    })

    it('does not expose agentErrorBody for other errors', async () => {
      stubFetch(async () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404))

      const error = (await apiFetch('/sessions/nope').catch((caught: unknown) => caught)) as ApiError

      expect(error.agentErrorBody).toBeNull()
    })

    it('falls back to a generic code when the body is not the contract error shape', async () => {
      stubFetch(async () => jsonResponse('<html>502</html>', 502))

      const error = (await apiFetch('/agents').catch((caught: unknown) => caught)) as ApiError

      expect(error.status).toBe(502)
      expect(error.code).toBe('HTTP_502')
    })
  })

  describe('timeouts and network failures', () => {
    it('maps a timeout to status 0 / NETWORK_ERROR', async () => {
      stubFetch(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            )
          }),
      )

      const error = (await apiFetch('/sessions/s1/messages', {
        method: 'POST',
        body: { text: 'hi' },
        timeoutMs: 20,
      }).catch((caught: unknown) => caught)) as ApiError

      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(0)
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.message).toMatch(/timed out/i)
    })

    it('maps a rejected fetch to status 0 / NETWORK_ERROR', async () => {
      stubFetch(async () => {
        throw new TypeError('Failed to fetch')
      })

      const error = (await apiFetch('/agents').catch((caught: unknown) => caught)) as ApiError

      expect(error.status).toBe(0)
      expect(error.code).toBe('NETWORK_ERROR')
    })

    it('does not abort a request that answers inside the timeout window', async () => {
      stubFetch(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(jsonResponse({ ok: true })), 5)
          }),
      )

      await expect(apiFetch('/agents', { timeoutMs: 500 })).resolves.toEqual({ ok: true })
    })
  })

  describe('401 handling', () => {
    afterEach(() => {
      clearStoredAuth()
    })

    it('clears the token and user, then redirects to /login', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { assign, href: 'http://localhost/', pathname: '/' })
      writeStoredAuth('mock-token-doctor', { id: 'u1', role: 'evaluator' })
      stubFetch(async () =>
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Token expired.' } }, 401),
      )

      const error = (await apiFetch('/agents').catch((caught: unknown) => caught)) as ApiError

      expect(error.status).toBe(401)
      expect(error.code).toBe('UNAUTHORIZED')
      expect(readStoredToken()).toBeNull()
      expect(window.localStorage.getItem(USER_STORAGE_KEY)).toBeNull()
      expect(assign).toHaveBeenCalledWith(LOGIN_PATH)
    })

    it('keeps the stored auth when login itself fails with 401', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { assign, href: 'http://localhost/', pathname: '/login' })
      writeStoredAuth('existing-token', { id: 'u1' })
      stubFetch(async () =>
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Wrong credentials.' } }, 401),
      )

      await expect(
        apiFetch('/auth/login', {
          method: 'POST',
          body: { username: 'doctor', password: 'nope' },
          allowUnauthorized: true,
        }),
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })

      expect(readStoredToken()).toBe('existing-token')
      expect(assign).not.toHaveBeenCalled()
    })
  })
})

describe('buildQuery', () => {
  it('skips empty values and encodes the rest', () => {
    expect(buildQuery({ status: 'completed', evaluated: false, limit: 50 })).toBe(
      '?status=completed&evaluated=false&limit=50',
    )
    expect(buildQuery({ status: undefined, evaluated: null, limit: undefined })).toBe('')
  })
})

describe('apiBaseUrl', () => {
  it('is the relative base URL with no trailing slash', () => {
    expect(apiBaseUrl()).toBe('/api/v1')
    expect(apiBaseUrl().endsWith('/')).toBe(false)
  })
})
