import { describe, expect, it } from 'vitest'

import { KEYS, USERS, expectExactKeys, expectUser, login, request } from './helpers'

/**
 * Scenario 1 — auth, and scenario 2 — the blind agents list.
 * Runs against the dev server seeded users (`doctor`/`doctor2`/`admin`).
 */
describe('T2 · scenario 1 — authentication', () => {
  it('logs in and returns the LoginResponse key set', async () => {
    const response = await request('/auth/login', {
      method: 'POST',
      body: USERS.doctor,
    })

    expect(response.status, response.rawText).toBe(200)
    const body = expectExactKeys(
      response.body,
      ['access_token', 'token_type', 'user'],
      [],
      'LoginResponse',
    )
    expect(typeof body.access_token).toBe('string')
    expect(typeof body.token_type).toBe('string')
    expectUser(body.user)
  })

  it('rejects a wrong password with a 401 error body', async () => {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { username: USERS.doctor.username, password: 'not-the-password' },
    })

    expect(response.status).toBe(401)
    expectExactKeys(response.body, ['error'], [], 'error body')
    const error = expectExactKeys(
      (response.body as { error: unknown }).error,
      ['code', 'message'],
      [],
      'error',
    )
    expect(error.code).toBe('UNAUTHORIZED')
  })

  it('returns the User key set from GET /auth/me', async () => {
    const doctor = await login(USERS.doctor.username, USERS.doctor.password)
    const response = await request('/auth/me', { token: doctor.token })

    expect(response.status).toBe(200)
    expectUser(response.body)
  })

  it('rejects GET /auth/me with a garbage token (401 UNAUTHORIZED)', async () => {
    const response = await request('/auth/me', { token: 'garbage-token' })
    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('only exposes the User keys, never a password hash', () => {
    // Belt-and-braces: the key list itself is the contract.
    expect(KEYS.User.required).toEqual(['id', 'username', 'display_name', 'role'])
  })
})

describe('T2 · scenario 2 — GET /agents', () => {
  it('returns AgentPublic[] only, with no model or architecture fields', async () => {
    const doctor = await login(USERS.doctor.username, USERS.doctor.password)
    const response = await request<unknown[]>('/agents', { token: doctor.token })

    expect(response.status, response.rawText).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThan(0)
    for (const agent of response.body) {
      const record = expectExactKeys(agent, KEYS.AgentPublic.required, [], 'AgentPublic')
      expect(Object.keys(record).sort()).toEqual(['description', 'display_name', 'id'])
    }
    expect(response.rawText).not.toContain('"model"')
    expect(response.rawText).not.toContain('"architecture"')
  })

  it('returns the same order on two consecutive calls', async () => {
    const doctor = await login(USERS.doctor.username, USERS.doctor.password)
    const first = await request<unknown[]>('/agents', { token: doctor.token })
    const second = await request<unknown[]>('/agents', { token: doctor.token })

    const ids = (body: unknown[]) => body.map((agent) => (agent as { id: string }).id)
    expect(ids(second.body)).toEqual(ids(first.body))
  })
})
