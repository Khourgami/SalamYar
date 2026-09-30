import { beforeAll, describe, expect, it } from 'vitest'

import {
  USERS,
  completeSession,
  createSessionFor,
  evaluationInput,
  expectErrorBody,
  expectEvaluation,
  expectFeedback,
  login,
  request,
} from './helpers'

import type { AuthedUser } from './helpers'

/** Scenarios 8–10: feedback, evaluation, and the comparison link. */
describe('T2 · feedback and evaluation', () => {
  let doctor: AuthedUser
  let doctor2: AuthedUser
  let admin: AuthedUser

  beforeAll(async () => {
    doctor = await login(USERS.doctor.username, USERS.doctor.password)
    doctor2 = await login(USERS.doctor2.username, USERS.doctor2.password)
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  /** A fresh session with one question message (so feedback has a valid target). */
  async function sessionWithQuestion(token: string) {
    const created = await createSessionFor(token, 'b-')
    const turn = await request<{
      agent_message: { id: string; kind: string }
      session: { messages: { id: string; kind: string }[] }
    }>(`/sessions/${created.id}/messages`, {
      method: 'POST',
      token,
      body: { text: 'از دیشب دل‌درد دارم.' },
    })
    expect(turn.status, turn.rawText).toBe(200)
    const greeting = turn.body.session.messages.find((message) => message.kind === 'greeting')
    expect(greeting, 'session has a greeting').toBeTruthy()
    return {
      sessionId: created.id,
      questionId: turn.body.agent_message.id,
      greetingId: greeting!.id,
    }
  }

  it('scenario 8 — PUT, PUT again, DELETE, DELETE again (204)', async () => {
    const { questionId } = await sessionWithQuestion(doctor.token)
    const path = `/messages/${questionId}/feedback`

    const first = await request(path, {
      method: 'PUT',
      token: doctor.token,
      body: { rating: 'up', note: 'پاسخ خوبی بود' },
    })
    expect(first.status, first.rawText).toBe(200)
    expectFeedback(first.body)
    expect((first.body as { rating: string }).rating).toBe('up')

    const updated = await request(path, {
      method: 'PUT',
      token: doctor.token,
      body: { rating: 'down', note: null },
    })
    expect(updated.status, updated.rawText).toBe(200)
    expect((updated.body as { rating: string }).rating).toBe('down')
    expect((updated.body as { note: null }).note).toBeNull()

    const deleted = await request(path, { method: 'DELETE', token: doctor.token })
    expect(deleted.status).toBe(204)

    const deletedAgain = await request(path, { method: 'DELETE', token: doctor.token })
    expect(deletedAgain.status).toBe(204)
  })

  it('scenario 8 — feedback on a greeting is 400, and a non-owner gets 403', async () => {
    const { greetingId, questionId } = await sessionWithQuestion(doctor.token)

    const onGreeting = await request(`/messages/${greetingId}/feedback`, {
      method: 'PUT',
      token: doctor.token,
      body: { rating: 'up', note: null },
    })
    expect(onGreeting.status, onGreeting.rawText).toBe(400)
    expectErrorBody(onGreeting.body, 'VALIDATION_ERROR')

    for (const other of [doctor2, admin]) {
      const response = await request(`/messages/${questionId}/feedback`, {
        method: 'PUT',
        token: other.token,
        body: { rating: 'up', note: null },
      })
      expect(response.status, `${other.username}: ${response.rawText}`).toBe(403)
      expectErrorBody(response.body, 'FORBIDDEN')
    }
  })

  it('scenario 9 — evaluation validation, locking, and read-only feedback', async () => {
    const created = await createSessionFor(doctor.token, 'b-')
    const completed = await completeSession(doctor.token, created.id)
    const messages = (completed.detail as { messages: { id: string; role: string; kind: string }[] })
      .messages
    const target = messages.find((message) => message.role === 'agent' && message.kind !== 'greeting')
    expect(target, 'a question/result message exists').toBeTruthy()

    const incomplete = evaluationInput()
    delete incomplete.comparison
    const missingComparison = await request(`/sessions/${created.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: incomplete,
    })
    expect(missingComparison.status, missingComparison.rawText).toBe(400)
    expectErrorBody(missingComparison.body, 'VALIDATION_ERROR')

    const valid = await request(`/sessions/${created.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput(),
    })
    expect(valid.status, valid.rawText).toBe(201)
    expectEvaluation(valid.body)
    expect((valid.body as { session_id: string }).session_id).toBe(created.id)

    const after = await request<{ evaluation: unknown; reveal: unknown }>(
      `/sessions/${created.id}`,
      { token: doctor.token },
    )
    expect(after.body.evaluation).not.toBeNull()
    expect(after.body.reveal).not.toBeNull()
    expectEvaluation(after.body.evaluation)

    const second = await request(`/sessions/${created.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput(),
    })
    expect(second.status, second.rawText).toBe(409)
    expectErrorBody(second.body, 'EVALUATION_LOCKED')

    const feedbackPut = await request(`/messages/${target!.id}/feedback`, {
      method: 'PUT',
      token: doctor.token,
      body: { rating: 'up', note: null },
    })
    expect(feedbackPut.status).toBe(409)
    expectErrorBody(feedbackPut.body, 'EVALUATION_LOCKED')

    const feedbackDelete = await request(`/messages/${target!.id}/feedback`, {
      method: 'DELETE',
      token: doctor.token,
    })
    expect(feedbackDelete.status).toBe(409)
    expectErrorBody(feedbackDelete.body, 'EVALUATION_LOCKED')

    return created.id
  })

  it('scenario 10 — comparison to another completed session succeeds, to itself is 400', async () => {
    const first = await createSessionFor(doctor.token, 'b-')
    await completeSession(doctor.token, first.id)
    const firstEvaluation = await request(`/sessions/${first.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput(),
    })
    expect(firstEvaluation.status, firstEvaluation.rawText).toBe(201)

    const second = await createSessionFor(doctor.token, 'a-')
    await completeSession(doctor.token, second.id)

    const selfComparison = await request(`/sessions/${second.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput({ comparison: { compared_session_id: second.id, winner: 'this' } }),
    })
    expect(selfComparison.status, selfComparison.rawText).toBe(400)
    expectErrorBody(selfComparison.body, 'VALIDATION_ERROR')

    const validComparison = await request(`/sessions/${second.id}/evaluation`, {
      method: 'POST',
      token: doctor.token,
      body: evaluationInput({ comparison: { compared_session_id: first.id, winner: 'other' } }),
    })
    expect(validComparison.status, validComparison.rawText).toBe(201)
    expectEvaluation(validComparison.body)
    expect(
      (validComparison.body as { comparison: { compared_session_id: string } }).comparison
        .compared_session_id,
    ).toBe(first.id)
  })
})
