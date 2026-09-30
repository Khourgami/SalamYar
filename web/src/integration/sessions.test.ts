import { beforeAll, describe, expect, it } from 'vitest'

import {
  USERS,
  completeSession,
  createSessionFor,
  evaluationInput,
  expectErrorBody,
  expectMessage,
  expectSessionDetail,
  login,
  request,
} from './helpers'

import type { AuthedUser } from './helpers'

/** Scenarios 3–7: session creation, chat completion, finish, concurrency and the 502 resend. */
describe('T2 · sessions', () => {
  let doctor: AuthedUser

  beforeAll(async () => {
    doctor = await login(USERS.doctor.username, USERS.doctor.password)
  })

  it('scenario 3 — POST /sessions returns an active session with exactly one greeting', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const response = await request(`/sessions/${created.id}`, { token: doctor.token })

    expect(response.status, response.rawText).toBe(200)
    expectSessionDetail(response.body)
    const detail = response.body as {
      status: string
      messages: { kind: string }[]
      result: unknown
      backstage: unknown
    }
    expect(detail.status).toBe('active')
    expect(detail.messages.filter((message) => message.kind === 'greeting')).toHaveLength(1)
    expect(detail.result).toBeNull()
    expect(detail.backstage).toBeNull()
  })

  it('scenario 4 — chats to completion for an a- agent and a b- agent', async () => {
    for (const prefix of ['a-', 'b-'] as const) {
      const created = await createSessionFor(doctor.token, prefix)
      const completed = await completeSession(doctor.token, created.id)
      const detail = completed.detail as {
        messages: { id: string; role: string }[]
        result: { guard: { final_triage_level: string } } | null
        backstage: { message_id: string }[] | null
        final_triage_level: string | null
      }

      expectSessionDetail(detail)
      expect(detail.result, `${prefix}: result is non-null`).not.toBeNull()
      expect(detail.backstage, `${prefix}: backstage is non-null`).not.toBeNull()

      const agentIds = new Set(
        detail.messages.filter((message) => message.role === 'agent').map((message) => message.id),
      )
      for (const turn of detail.backstage!) {
        expect(
          agentIds.has(turn.message_id),
          `${prefix}: BackstageTurn.message_id ${turn.message_id} is an agent message`,
        ).toBe(true)
      }

      expect(detail.final_triage_level).toBe(detail.result!.guard.final_triage_level)
    }
  })

  it('scenario 5 — POST /finish on an active session ends it as evaluator_ended', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const response = await request<{
      patient_message: unknown
      agent_message: { kind: string }
      session: { end_reason: string; result: unknown }
    }>(`/sessions/${created.id}/finish`, { method: 'POST', token: doctor.token, body: {} })

    expect(response.status, response.rawText).toBe(200)
    expect(response.body.patient_message).toBeNull()
    expect(response.body.agent_message.kind).toBe('result')
    expect(response.body.session.end_reason).toBe('evaluator_ended')
    expect(response.body.session.result).not.toBeNull()
  })

  it('scenario 6 — two concurrent messages: one 200 and one 409 TURN_IN_PROGRESS', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const send = (text: string) =>
      request(`/sessions/${created.id}/messages`, { method: 'POST', token: doctor.token, body: { text } })

    const [first, second] = await Promise.all([send('اولین پیام همزمان'), send('دومین پیام همزمان')])
    const statuses = [first.status, second.status].sort((a, b) => a - b)

    expect(statuses).toEqual([200, 409])
    const rejected = first.status === 409 ? first : second
    expectErrorBody(rejected.body, 'TURN_IN_PROGRESS')
  })

  it('scenario 7 — «خطا» fails once with 502, then the resend succeeds without duplicating', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const text = 'از دیروز درد دارم، شاید خطا کرده‌ام.'

    const failed = await request<{
      error: { code: string }
      patient_message: { id: string; kind: string; text: string }
      agent_message: { kind: string }
    }>(`/sessions/${created.id}/messages`, { method: 'POST', token: doctor.token, body: { text } })

    expect(failed.status, failed.rawText).toBe(502)
    expect(failed.body.error.code).toBe('AGENT_ERROR')
    expect(failed.body.patient_message.kind).toBe('text')
    expect(failed.body.patient_message.text).toBe(text)
    expect(failed.body.agent_message.kind).toBe('error')
    expectMessage(failed.body.patient_message)
    expectMessage(failed.body.agent_message)
    expect(failed.body.patient_message.id).toBeTruthy()

    const active = await request<{ status: string }>(`/sessions/${created.id}`, {
      token: doctor.token,
    })
    expect(active.body.status).toBe('active')

    const resent = await request(`/sessions/${created.id}/messages`, {
      method: 'POST',
      token: doctor.token,
      body: { text },
    })
    expect(resent.status, resent.rawText).toBe(200)

    const after = await request<{ messages: { role: string; kind: string; text: string }[] }>(
      `/sessions/${created.id}`,
      { token: doctor.token },
    )
    expectSessionDetail(after.body)
    const copies = after.body.messages.filter(
      (message) => message.role === 'patient' && message.text === text,
    )
    expect(copies).toHaveLength(1)
  })

  it('v1.2 — the five cost/token stats are null until evaluation, then numbers; the admin always sees them', async () => {
    const HIDDEN = [
      'total_cost_usd',
      'llm_calls',
      'prompt_tokens',
      'completion_tokens',
      'reasoning_tokens',
    ] as const

    const created = await createSessionFor(doctor.token, 'b-')
    const completed = await completeSession(doctor.token, created.id)
    const before = (completed.detail as { result: { stats: Record<string, unknown> } }).result
    expect(before, 'a completed session has a result card').toBeTruthy()
    for (const key of HIDDEN) {
      expect(before.stats[key], `unevaluated ResultCard.stats.${key}`).toBeNull()
    }

    // the admin reads the same still-unevaluated session and always gets the values
    const admin = await login(USERS.admin.username, USERS.admin.password)
    const adminView = await request<{ result: { stats: Record<string, unknown> } }>(
      `/admin/sessions/${created.id}`,
      { token: admin.token },
    )
    expect(adminView.status, adminView.rawText).toBe(200)
    for (const key of ['llm_calls', 'prompt_tokens', 'completion_tokens'] as const) {
      expect(typeof adminView.body.result.stats[key], `admin ResultCard.stats.${key}`).toBe('number')
    }

    // after the evaluator submits, the values are revealed to them too
    const evaluation = await request(`/sessions/${created.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput(),
    })
    expect(evaluation.status, evaluation.rawText).toBe(201)

    const after = await request<{ result: { stats: Record<string, unknown> } }>(
      `/sessions/${created.id}`,
      { token: doctor.token },
    )
    expect(after.status, after.rawText).toBe(200)
    const stats = after.body.result.stats
    for (const key of ['llm_calls', 'prompt_tokens', 'completion_tokens'] as const) {
      expect(typeof stats[key], `evaluated ResultCard.stats.${key}`).toBe('number')
    }
    // an all-None provider (the dev server's DemoLLM) may legitimately report no reasoning/cost
    for (const key of ['reasoning_tokens', 'total_cost_usd'] as const) {
      expect(stats[key] === null || typeof stats[key] === 'number', `evaluated ${key}`).toBe(true)
    }
  })
})
