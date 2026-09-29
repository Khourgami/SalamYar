import { describe, expect, it, vi } from 'vitest'

import { writeStoredAuth } from '@/api/client'
import {
  adminExportUrl,
  adminListSessions,
  adminMetrics,
  createSession,
  downloadAdminExport,
  finishSession,
  getSession,
  listAgents,
  listSessions,
  login,
  postMessage,
  putFeedback,
  reloadAgents,
  submitEvaluation,
} from '@/api/endpoints'
import { blobResponse, jsonResponse } from '@/test/fetchMock'
import { emptyEvaluationInput } from '@/test/factories'

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('endpoints', () => {
  it('posts the credentials to /auth/login', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({ access_token: 't', token_type: 'bearer', user: { id: 'u1' } }),
    )

    await login({ username: 'doctor', password: 'doctor123' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/login')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ username: 'doctor', password: 'doctor123' }))
  })

  it('builds the contract paths for the session endpoints', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}))

    await listAgents()
    await createSession({ agent_id: 'b-sonnet5' })
    await getSession('s-1')
    await putFeedback('m-1', { rating: 'up', note: 'خوب بود' })
    await submitEvaluation('s-1', emptyEvaluationInput())
    await finishSession('s-1')
    await reloadAgents()

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)
    expect(calls).toEqual([
      'GET /api/v1/agents',
      'POST /api/v1/sessions',
      'GET /api/v1/sessions/s-1',
      'PUT /api/v1/messages/m-1/feedback',
      'POST /api/v1/sessions/s-1/evaluation',
      'POST /api/v1/sessions/s-1/finish',
      'POST /api/v1/admin/agents/reload',
    ])
  })

  it('adds the list query parameters', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ items: [], total: 0 }))

    await listSessions({ status: 'completed', evaluated: false, limit: 50, offset: 0 })
    await adminListSessions({ agent_id: 'b-gpt54', evaluated: true })
    await adminMetrics('architecture')

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/v1/sessions?status=completed&evaluated=false&limit=50&offset=0',
    )
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/admin/sessions?agent_id=b-gpt54&evaluated=true')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/admin/metrics?group_by=architecture')
    expect(fetchMock.mock.calls[2][1].method).toBe('GET')
  })

  it('encodes session ids', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}))
    await getSession('a/b c')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/sessions/a%2Fb%20c')
  })
})

describe('long-running endpoints', () => {
  it('uses the 90 s timeout for postMessage', async () => {
    vi.useFakeTimers()
    try {
      const aborted: string[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                aborted.push(url)
                reject(new DOMException('aborted', 'AbortError'))
              })
            }),
        ),
      )

      const pending = expect(postMessage('s-1', 'سلام')).rejects.toMatchObject({
        status: 0,
        code: 'NETWORK_ERROR',
      })

      await vi.advanceTimersByTimeAsync(30_000)
      expect(aborted).toEqual([])

      await vi.advanceTimersByTimeAsync(60_000)
      expect(aborted).toEqual(['/api/v1/sessions/s-1/messages'])

      await pending
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the 90 s timeout for finishSession', async () => {
    vi.useFakeTimers()
    try {
      const aborted: string[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                aborted.push(url)
                reject(new DOMException('aborted', 'AbortError'))
              })
            }),
        ),
      )

      const pending = expect(finishSession('s-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

      await vi.advanceTimersByTimeAsync(90_000)

      expect(aborted).toEqual(['/api/v1/sessions/s-1/finish'])
      await pending
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('CSV export', () => {
  it('builds a relative export URL for every table', () => {
    expect(adminExportUrl('sessions')).toBe('/api/v1/admin/export/sessions.csv')
    expect(adminExportUrl('llm_calls')).toBe('/api/v1/admin/export/llm_calls.csv')
  })

  it('downloads the CSV as a Blob named <table>.csv', async () => {
    writeStoredAuth('mock-token-admin', { id: 'u-admin' })
    const fetchMock = stubFetch(async () => blobResponse('س,ن\n1,2\n'))

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const anchors: HTMLAnchorElement[] = []
    const nativeCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = nativeCreateElement(tagName, options)
      if (tagName === 'a') anchors.push(element as HTMLAnchorElement)
      return element
    }) as typeof document.createElement)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadAdminExport('sessions')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/admin/export/sessions.csv')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer mock-token-admin')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('sessions.csv')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
