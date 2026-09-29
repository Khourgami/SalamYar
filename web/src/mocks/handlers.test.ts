import { describe, expect, it } from 'vitest'

import { ApiError, writeStoredAuth } from '@/api/client'
import {
  adminListSessions,
  adminMetrics,
  createSession,
  deleteFeedback,
  finishSession,
  getSession,
  listAgents,
  listSessions,
  login,
  postMessage,
  submitEvaluation,
} from '@/api/endpoints'
import { GREETING_FA, MOCK_ERROR_TRIGGER } from '@/mocks/data'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { setupMockApi, stubNavigation } from '@/test/msw'
import { validEvaluationInput } from '@/test/factories'

setupMockApi()

async function loginAs(username: string, password: string) {
  const response = await login({ username, password })
  writeStoredAuth(response.access_token, response.user)
  return response.user
}

describe('auth', () => {
  it('returns a token and the user for valid credentials', async () => {
    const response = await login({ username: 'doctor', password: 'doctor123' })

    expect(response.access_token).toBe('mock-token-doctor')
    expect(response.token_type).toBe('bearer')
    expect(response.user.username).toBe('doctor')
    expect(response.user.display_name).toBe('دکتر آزمایشی')
    expect(response.user.role).toBe('evaluator')
  })

  it('rejects wrong credentials with the contract 401 body', async () => {
    const error = (await login({ username: 'doctor', password: 'nope' }).catch(
      (caught: unknown) => caught,
    )) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Wrong username or password.' },
    })
  })

  it('rejects requests without a token and redirects to /login', async () => {
    const assign = stubNavigation()

    const error = (await listAgents().catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHORIZED')
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('rejects requests with an unknown token', async () => {
    stubNavigation()
    writeStoredAuth('mock-token-ghost', { id: 'ghost' })
    const error = (await listAgents().catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(401)
  })
})

describe('agents', () => {
  it('returns the 8 blind doctors named دکتر ۱ … دکتر ۸', async () => {
    await loginAs('doctor', 'doctor123')
    const agents = await listAgents()

    expect(agents).toHaveLength(8)
    expect(agents.map((agent) => agent.display_name)).toEqual([
      'دکتر ۱',
      'دکتر ۲',
      'دکتر ۳',
      'دکتر ۴',
      'دکتر ۵',
      'دکتر ۶',
      'دکتر ۷',
      'دکتر ۸',
    ])
    expect(agents[0].id).toBe('b-gemini3flash')
    expect(agents[1].id).toBe('a-sonnet5')
    expect(agents[2].id).toBe('b-gpt54')
    expect(agents[3].id).toBe('b-deepseekv4pro')
    expect(agents[4].id).toBe('a-gpt54')
    expect(agents[5].id).toBe('b-sonnet5')
    expect(agents[6].id).toBe('b-gpt5mini')
    expect(agents[7].id).toBe('b-gemini31pro')
  })
})

describe('sessions', () => {
  it('pre-loads the fixtures for the doctor user', async () => {
    await loginAs('doctor', 'doctor123')
    const list = await listSessions()

    expect(list.total).toBe(3)
    expect(list.items.map((item) => item.id)).toEqual([
      FIXTURE_SESSION_IDS.active,
      FIXTURE_SESSION_IDS.completedStructured,
      FIXTURE_SESSION_IDS.evaluated,
    ])
    const evaluated = list.items.find((item) => item.id === FIXTURE_SESSION_IDS.evaluated)
    expect(evaluated?.evaluated).toBe(true)
  })

  it('creates a session with the exact greeting and no result', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-gemini3flash' })

    expect(session.status).toBe('active')
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].role).toBe('agent')
    expect(session.messages[0].kind).toBe('greeting')
    expect(session.messages[0].text).toBe(GREETING_FA)
    expect(session.result).toBeNull()
    expect(session.backstage).toBeNull()
    expect(session.reveal).toBeNull()
  })

  it('returns 404 for a disabled or unknown agent', async () => {
    await loginAs('doctor', 'doctor123')
    const error = (await createSession({ agent_id: 'nope' }).catch(
      (caught: unknown) => caught,
    )) as ApiError
    expect(error.status).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('filters by status and evaluated', async () => {
    await loginAs('doctor', 'doctor123')

    const completed = await listSessions({ status: 'completed' })
    expect(completed.items.map((item) => item.id)).toEqual([
      FIXTURE_SESSION_IDS.completedStructured,
      FIXTURE_SESSION_IDS.evaluated,
    ])

    const unevaluated = await listSessions({ evaluated: false })
    expect(unevaluated.items.map((item) => item.id)).toEqual([
      FIXTURE_SESSION_IDS.active,
      FIXTURE_SESSION_IDS.completedStructured,
    ])
  })
})

describe('the mock conversation', () => {
  it('asks a rotating follow-up question and concludes on the 5th patient message', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-sonnet5' })

    for (let turn = 1; turn <= 4; turn += 1) {
      const response = await postMessage(session.id, `پیام شماره ${turn}`)
      expect(response.agent_message.kind).toBe('question')
      expect(response.agent_message.text.length).toBeGreaterThan(0)
      expect(response.session.status).toBe('active')
      expect(response.session.questions_asked).toBe(turn)
    }

    const fifth = await postMessage(session.id, 'پیام شماره ۵')

    expect(fifth.agent_message.kind).toBe('result')
    expect(fifth.session.status).toBe('completed')
    expect(fifth.session.end_reason).toBe('agent_concluded')
    expect(fifth.session.result).not.toBeNull()
    expect(fifth.session.backstage).not.toBeNull()
    expect(fifth.session.result?.assessment.differential).toHaveLength(3)
    expect(fifth.session.result?.guard.actions).toEqual([])
    expect(fifth.session.result?.stats.questions_asked).toBe(4)

    const detail = await getSession(session.id)
    expect(detail.status).toBe('completed')
    expect(detail.reveal).toBeNull()
  })

  it('escalates to EMERGENCY_NOW for b-gpt54 (safety floor)', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-gpt54' })

    const finished = await finishSession(session.id)
    const guard = finished.session.result?.guard

    expect(guard?.actions).toEqual(['safety_floor_escalation'])
    expect(guard?.raw_triage_level).toBe('URGENT_24H')
    expect(guard?.final_triage_level).toBe('EMERGENCY_NOW')
    expect(finished.session.result?.assessment.triage_level).toBe('EMERGENCY_NOW')
    expect(finished.agent_message.kind).toBe('result')
    expect(finished.patient_message).toBeNull()
  })

  it('returns the 502 AGENT_ERROR body for a message containing خطا and stays active', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-sonnet5' })
    const text = `این پیام ${MOCK_ERROR_TRIGGER} دارد`

    const error = (await postMessage(session.id, text).catch(
      (caught: unknown) => caught,
    )) as ApiError

    expect(error.status).toBe(502)
    expect(error.code).toBe('AGENT_ERROR')
    expect(error.agentErrorBody).not.toBeNull()
    expect(error.agentErrorBody?.agent_message.kind).toBe('error')
    expect(error.agentErrorBody?.patient_message.text).toBe(text)

    const detail = await getSession(session.id)
    expect(detail.status).toBe('active')
    expect(detail.result).toBeNull()
    expect(detail.messages.map((message) => message.kind)).toEqual([
      'greeting',
      'text',
      'error',
    ])
  })

  it('reuses the unanswered patient message when the evaluator resends', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-sonnet5' })
    const text = `متن ${MOCK_ERROR_TRIGGER}`

    const first = (await postMessage(session.id, text).catch(
      (caught: unknown) => (caught as ApiError).agentErrorBody,
    ))!
    const second = (await postMessage(session.id, text).catch(
      (caught: unknown) => (caught as ApiError).agentErrorBody,
    ))!

    expect(second.patient_message?.id).toBe(first.patient_message?.id)

    const detail = await getSession(session.id)
    expect(detail.messages.filter((message) => message.role === 'patient')).toHaveLength(1)
  })

  it('rejects posting to a completed session', async () => {
    await loginAs('doctor', 'doctor123')
    const error = (await postMessage(FIXTURE_SESSION_IDS.completedStructured, 'سلام').catch(
      (caught: unknown) => caught,
    )) as ApiError

    expect(error.status).toBe(409)
    expect(error.code).toBe('SESSION_COMPLETED')
  })

  it('rejects an empty message with a 400', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-sonnet5' })
    const error = (await postMessage(session.id, '   ').catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(400)
    expect(error.code).toBe('VALIDATION_ERROR')
  })
})

describe('feedback', () => {
  it('is stored per message and blocking after evaluation', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'a-sonnet5' })
    const turn = await postMessage(session.id, 'دل‌درد دارم')
    const messageId = turn.agent_message.id

    const { putFeedback } = await import('@/api/endpoints')
    const feedback = await putFeedback(messageId, { rating: 'up', note: 'سؤال خوبی بود' })
    expect(feedback.rating).toBe('up')
    expect(feedback.note).toBe('سؤال خوبی بود')

    const detail = await getSession(session.id)
    expect(detail.feedback).toHaveLength(1)

    await deleteFeedback(messageId)
    const afterDelete = await getSession(session.id)
    expect(afterDelete.feedback).toHaveLength(0)
  })

  it('returns 409 EVALUATION_LOCKED on the evaluated fixture', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await getSession(FIXTURE_SESSION_IDS.evaluated)
    const messageId = session.feedback[0].message_id

    const error = (await deleteFeedback(messageId).catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(409)
    expect(error.code).toBe('EVALUATION_LOCKED')
  })
})

describe('evaluation and reveal', () => {
  it('locks evaluation until the session is completed', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'a-sonnet5' })

    const error = (await submitEvaluation(session.id, validEvaluationInput()).catch(
      (caught: unknown) => caught,
    )) as ApiError

    expect(error.status).toBe(409)
    expect(error.code).toBe('SESSION_NOT_COMPLETED')
  })

  it('shows the reveal only after the evaluation was submitted', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await createSession({ agent_id: 'b-deepseekv4pro' })
    await finishSession(session.id)

    const completed = await getSession(session.id)
    expect(completed.status).toBe('completed')
    expect(completed.evaluation).toBeNull()
    expect(completed.reveal).toBeNull()

    const evaluation = await submitEvaluation(session.id, validEvaluationInput())
    expect(evaluation.session_id).toBe(session.id)
    expect(evaluation.created_at).toBeTruthy()

    const evaluated = await getSession(session.id)
    expect(evaluated.evaluated).toBe(true)
    expect(evaluated.reveal).toEqual({
      architecture: 'structured',
      model: 'deepseek/deepseek-v4-pro',
      config: {
        max_questions: 12,
        safety_floor: true,
        emergency_threshold: 0.2,
        reasoning_effort: 'low',
        temperature: 0.3,
        prompt_version: 'v1',
      },
    })

    const again = (await submitEvaluation(session.id, validEvaluationInput()).catch(
      (caught: unknown) => caught,
    )) as ApiError
    expect(again.status).toBe(409)
    expect(again.code).toBe('EVALUATION_LOCKED')
  })

  it('rejects an incomplete evaluation payload', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await getSession(FIXTURE_SESSION_IDS.completedStructured)

    const error = (await submitEvaluation(
      session.id,
      validEvaluationInput({ scores: { ...validEvaluationInput().scores, efficiency: 0 } }),
    ).catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(400)
    expect(error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a comparison against a session of another user', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await getSession(FIXTURE_SESSION_IDS.completedStructured)

    const error = (await submitEvaluation(
      session.id,
      validEvaluationInput({
        comparison: { compared_session_id: 'does-not-exist', winner: 'this' },
      }),
    ).catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(400)
    expect(error.code).toBe('VALIDATION_ERROR')
  })

  it('accepts a comparison against another completed session of the same user', async () => {
    await loginAs('doctor', 'doctor123')
    const session = await getSession(FIXTURE_SESSION_IDS.completedStructured)

    const evaluation = await submitEvaluation(
      session.id,
      validEvaluationInput({
        comparison: { compared_session_id: FIXTURE_SESSION_IDS.evaluated, winner: 'other' },
      }),
    )

    expect(evaluation.comparison).toEqual({
      compared_session_id: FIXTURE_SESSION_IDS.evaluated,
      winner: 'other',
    })
  })
})

describe('admin', () => {
  it('blocks evaluators from the admin endpoints', async () => {
    await loginAs('doctor', 'doctor123')

    const metricsError = (await adminMetrics().catch((caught: unknown) => caught)) as ApiError
    expect(metricsError.status).toBe(403)
    expect(metricsError.code).toBe('FORBIDDEN')

    const sessionsError = (await adminListSessions().catch((caught: unknown) => caught)) as ApiError
    expect(sessionsError.status).toBe(403)
  })

  it('lists every session with the user and the reveal', async () => {
    await loginAs('admin', 'admin123')
    const list = await adminListSessions()

    expect(list.total).toBe(3)
    expect(list.items[0].user.display_name).toBe('دکتر آزمایشی')
    expect(list.items[0].agent_reveal.model).toBeTruthy()
  })

  it('returns plausible metrics rows for all three groupings', async () => {
    await loginAs('admin', 'admin123')

    const byAgent = await adminMetrics('agent')
    expect(byAgent.group_by).toBe('agent')
    expect(byAgent.rows).toHaveLength(8)
    expect(byAgent.rows[0].label).toBe('دکتر ۱')
    expect(byAgent.rows[0].mean_scores.overall_trust).toBeGreaterThan(0)
    expect(byAgent.rows.some((row) => (row.undertriage_rate ?? 0) > 0)).toBe(true)

    const byArchitecture = await adminMetrics('architecture')
    expect(byArchitecture.rows.map((row) => row.key)).toEqual(['simple', 'structured'])
    expect(byArchitecture.rows.every((row) => row.model === null)).toBe(true)

    const byModel = await adminMetrics('model')
    expect(byModel.rows.length).toBeGreaterThanOrEqual(6)
    expect(byModel.rows.every((row) => row.architecture === null)).toBe(true)

    expect(byAgent.generated_at).toBeTruthy()
  })
})
