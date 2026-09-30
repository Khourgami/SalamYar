import { beforeAll, describe, expect, it } from 'vitest'

import {
  USERS,
  createSessionFor,
  expectAgentReveal,
  expectErrorBody,
  expectSessionDetail,
  login,
  request,
} from './helpers'

import type { AuthedUser } from './helpers'

/** Scenario 11: owner-only §5/§6 endpoints, and the admin read path of §7. */
describe('T2 · scenario 11 — ownership', () => {
  let doctor: AuthedUser
  let doctor2: AuthedUser
  let admin: AuthedUser

  beforeAll(async () => {
    doctor = await login(USERS.doctor.username, USERS.doctor.password)
    doctor2 = await login(USERS.doctor2.username, USERS.doctor2.password)
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  it('gives 403 to doctor2 and to admin on another user’s session, 404 for an unknown id', async () => {
    const created = await createSessionFor(doctor.token, 'b-')

    for (const other of [doctor2, admin]) {
      const response = await request(`/sessions/${created.id}`, { token: other.token })
      expect(response.status, `${other.username}: ${response.rawText}`).toBe(403)
      expectErrorBody(response.body, 'FORBIDDEN')
    }

    const unknown = await request('/sessions/00000000-0000-0000-0000-000000000000', {
      token: doctor.token,
    })
    expect(unknown.status).toBe(404)
    expectErrorBody(unknown.body, 'NOT_FOUND')
  })

  it('serves the admin read path with reveal, while an evaluator gets 403', async () => {
    const created = await createSessionFor(doctor.token, 'b-')

    const adminRead = await request(`/admin/sessions/${created.id}`, { token: admin.token })
    expect(adminRead.status, adminRead.rawText).toBe(200)
    expectSessionDetail(adminRead.body)
    const detail = adminRead.body as { reveal: unknown }
    expect(detail.reveal, 'admin detail always carries reveal').not.toBeNull()
    expectAgentReveal(detail.reveal)

    const evaluatorRead = await request(`/admin/sessions/${created.id}`, { token: doctor.token })
    expect(evaluatorRead.status).toBe(403)
    expectErrorBody(evaluatorRead.body, 'FORBIDDEN')
  })

  it('gives 403 to admin on every owner-only session endpoint', async () => {
    const created = await createSessionFor(doctor.token, 'b-')

    const detail = await request(`/sessions/${created.id}/messages`, {
      method: 'POST',
      token: admin.token,
      body: { text: 'سلام' },
    })
    expect(detail.status).toBe(403)

    const finish = await request(`/sessions/${created.id}/finish`, {
      method: 'POST',
      token: admin.token,
      body: {},
    })
    expect(finish.status).toBe(403)
  })
})
