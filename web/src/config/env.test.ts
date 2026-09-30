import { describe, expect, it } from 'vitest'

import { DEFAULT_API_PROXY_TARGET, resolveApiProxyTarget } from '@/config/env'

describe('resolveApiProxyTarget', () => {
  it('defaults to localhost:8000 when unset', () => {
    expect(resolveApiProxyTarget(undefined)).toBe(DEFAULT_API_PROXY_TARGET)
    expect(resolveApiProxyTarget(null)).toBe(DEFAULT_API_PROXY_TARGET)
  })

  it('treats a blank override as unset', () => {
    expect(resolveApiProxyTarget('')).toBe(DEFAULT_API_PROXY_TARGET)
    expect(resolveApiProxyTarget('   ')).toBe(DEFAULT_API_PROXY_TARGET)
  })

  it('returns a trimmed custom target', () => {
    expect(resolveApiProxyTarget(' http://localhost:8001 ')).toBe('http://localhost:8001')
  })
})
