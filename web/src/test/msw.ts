import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

import { setMockTurnDelayMs } from '@/mocks/data'
import { server } from '@/mocks/server'
import { mockStore } from '@/mocks/store'

/**
 * Node's `fetch` refuses relative URLs, so under Vitest the client needs an absolute base URL.
 * In the browser the base URL stays relative (`/api/v1`) and Vite/nginx proxy it.
 */
export const TEST_API_BASE_URL = 'http://localhost/api/v1'

export interface MockApiOptions {
  /** Turn delay of `POST /sessions/{id}/messages`. Defaults to 0 so tests stay fast. */
  turnDelayMs?: number
}

/**
 * Node's `fetch` (undici) rejects an `AbortSignal` that was created in another realm
 * (`RequestInit: Expected signal to be an instance of AbortSignal`) and Vitest's jsdom
 * environment supplies jsdom's own `AbortController`. MSW wraps Node's `fetch`, so any request
 * carrying a signal fails before a handler can run.
 *
 * Requests in these tests never rely on real cancellation (the mock delay is 0), so the signal is
 * dropped at this boundary. The timeout behaviour itself is covered by unit tests that stub
 * `fetch` directly, where no undici request conversion happens.
 */
function bridgeAbortSignal(): void {
  const interceptedFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) {
      const { signal: _signal, ...rest } = init
      return interceptedFetch(input, rest)
    }
    return interceptedFetch(input, init)
  }) as typeof fetch
}

/**
 * jsdom does not implement navigation, so a 401 redirect prints a noisy "Not implemented"
 * error. Tests that exercise the 401 path call this to capture the redirect instead.
 */
export function stubNavigation(): ReturnType<typeof vi.fn> {
  const assign = vi.fn()
  vi.stubGlobal('location', {
    href: 'http://localhost/',
    origin: 'http://localhost',
    pathname: '/',
    search: '',
    hash: '',
    assign,
  })
  return assign
}

/** Wire the MSW handlers, the auth env and a fresh store into the current test file. */
export function setupMockApi(options: MockApiOptions = {}): void {
  const turnDelayMs = options.turnDelayMs ?? 0

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
    bridgeAbortSignal()
  })

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE_URL)
    setMockTurnDelayMs(turnDelayMs)
    mockStore.reset()
    window.localStorage.clear()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })
}
