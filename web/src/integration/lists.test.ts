import { beforeAll, describe, expect, it } from 'vitest'

import {
  KEYS,
  USERS,
  createSessionFor,
  expectAgentReveal,
  expectExactKeys,
  expectSessionSummary,
  expectUser,
  login,
  request,
} from './helpers'

import type { AuthedUser } from './helpers'

interface SummaryShape {
  id: string
  created_at: string
  evaluated: boolean
}

/** Scenario 12: both session lists (order, `total`, filters, and the admin item shape). */
describe('T2 · scenario 12 — lists', () => {
  let doctor: AuthedUser
  let admin: AuthedUser

  beforeAll(async () => {
    doctor = await login(USERS.doctor.username, USERS.doctor.password)
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  it('GET /sessions is newest first and carries `total`', async () => {
    const older = await createSessionFor(doctor.token, 'b-')
    const newer = await createSessionFor(doctor.token, 'b-')

    const response = await request<{ items: SummaryShape[]; total: number }>('/sessions', {
      token: doctor.token,
    })
    expect(response.status, response.rawText).toBe(200)
    expectExactKeys(response.body, ['items', 'total'], [], 'SessionListResponse')
    expect(typeof response.body.total).toBe('number')
    expect(response.body.total).toBeGreaterThanOrEqual(response.body.items.length)
    response.body.items.forEach((item) => expectSessionSummary(item))

    const ids = response.body.items.map((item) => item.id)
    expect(ids).toContain(older.id)
    expect(ids).toContain(newer.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id))
  })

  it('GET /sessions?evaluated=false only returns unevaluated sessions', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const response = await request<{ items: SummaryShape[] }>('/sessions?evaluated=false', {
      token: doctor.token,
    })

    expect(response.status, response.rawText).toBe(200)
    expect(response.body.items.every((item) => item.evaluated === false)).toBe(true)
    expect(response.body.items.map((item) => item.id)).toContain(created.id)
  })

  it('GET /admin/sessions items carry `user` and `agent_reveal`', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const response = await request<{ items: unknown[]; total: number }>('/admin/sessions', {
      token: admin.token,
    })

    expect(response.status, response.rawText).toBe(200)
    expectExactKeys(response.body, ['items', 'total'], [], 'AdminSessionListResponse')
    expect(response.body.items.length).toBeGreaterThan(0)

    const extra = ['user', 'agent_reveal']
    for (const item of response.body.items) {
      expectSessionSummary(item, extra)
      const record = expectExactKeys(
        item,
        [...KEYS.SessionSummary.required, ...extra],
        [],
        'AdminSessionSummary',
      )
      expectUser(record.user)
      expectAgentReveal(record.agent_reveal)
    }

    const found = (response.body.items as { id: string }[]).find((item) => item.id === created.id)
    expect(found, 'admin list includes the new session').toBeTruthy()
  })

  it('GET /admin/sessions?evaluated=false filters', async () => {
    const response = await request<{ items: { evaluated: boolean }[] }>(
      '/admin/sessions?evaluated=false',
      { token: admin.token },
    )
    expect(response.status, response.rawText).toBe(200)
    expect(response.body.items.every((item) => item.evaluated === false)).toBe(true)
  })
})
