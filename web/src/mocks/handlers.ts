/**
 * MSW handlers implementing **every** endpoint of `../../docs/API_CONTRACT.md` v1 against a
 * stateful in-memory store. Used by the browser worker (`VITE_USE_MOCKS=true`) and by the tests
 * through `msw/node`.
 */

import { HttpResponse, http } from 'msw'
import type { RequestHandler } from 'msw'

import type {
  AdminSessionSummary,
  Evaluation,
  EvaluationInput,
  ExportTable,
  Feedback,
  MetricsGroupBy,
  MetricsResponse,
  MetricsRow,
  SafetyFlagKey,
  ScoreKey,
  SessionStatus,
  TurnResponse,
  User,
} from '@/api/types'
import {
  EVALUATION_SCORE_KEYS,
  SAFETY_FLAG_KEYS,
  SPECIALTIES,
  TRIAGE_LEVELS,
} from '@/api/types'
import {
  ERROR_FA,
  MOCK_AGENTS,
  MOCK_AGENT_SEEDS,
  MOCK_CONCLUSION_AFTER_PATIENT_MESSAGES,
  MOCK_ERROR_TRIGGER,
  MOCK_FOLLOW_UP_QUESTIONS,
  MOCK_USERS,
  mockRevealFor,
  mockToken,
  mockTurnDelayMs,
  nowIso,
  publicUser,
  usernameFromToken,
} from '@/mocks/data'
import type { MockUserRecord } from '@/mocks/data'
import { mockStore } from '@/mocks/store'
import { appendMessage, toDetail, toSummary } from '@/mocks/model'
import type { StoredSession } from '@/mocks/model'

/** Wildcard origin so the same handlers work in the browser and under `msw/node`. */
const API = '*/api/v1'

const MAX_MESSAGE_LENGTH = 2_000
const MAX_NOTE_LENGTH = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return HttpResponse.json({ error: { code, message }, ...(extra ?? {}) }, { status })
}

function unauthorized() {
  return errorResponse(401, 'UNAUTHORIZED', 'Missing, invalid or expired token.')
}

function forbidden() {
  return errorResponse(403, 'FORBIDDEN', 'You do not have access to this resource.')
}

function notFound(what = 'Resource') {
  return errorResponse(404, 'NOT_FOUND', `${what} not found.`)
}

function validationError(message: string) {
  return errorResponse(400, 'VALIDATION_ERROR', message)
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null
  return value
}

function currentUser(request: Request): MockUserRecord | null {
  const token = bearerToken(request)
  if (!token) return null
  const username = usernameFromToken(token)
  if (!username) return null
  return MOCK_USERS.find((user) => user.username === username) ?? null
}

/**
 * v1.1 §5/§6: every session- or message-scoped endpoint is **owner-only for every role**,
 * admins included. Admins read other users' sessions only through `/admin/sessions/{id}`.
 */
function isOwner(session: StoredSession, user: MockUserRecord): boolean {
  return session.user_id === user.id
}

/* ------------------------------------------------------------------ *
 * Evaluation validation (API_CONTRACT §6, v1.1: strict body)
 * ------------------------------------------------------------------ */

const EVALUATION_KEYS = [
  'scores',
  'unnecessary_questions_count',
  'safety_flags',
  'doctor_verdict',
  'comments',
  'comparison',
] as const

const COMMENT_KEYS = ['strengths', 'weaknesses', 'missed_questions', 'general'] as const

/** Exactly the expected key set: every required key present, no unknown key. */
function hasExactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as Record<string, unknown>)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function validateEvaluation(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'The body must be a JSON object.'
  }
  if (!hasExactKeys(input, EVALUATION_KEYS)) {
    return `The body must contain exactly: ${EVALUATION_KEYS.join(', ')}.`
  }

  const body = input as Record<string, unknown>

  const scores = body.scores
  if (!hasExactKeys(scores, EVALUATION_SCORE_KEYS)) {
    return 'scores must contain every KPI key and nothing else.'
  }
  for (const key of EVALUATION_SCORE_KEYS) {
    const value = (scores as Record<string, unknown>)[key]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      return `scores.${key} must be an integer between 1 and 5.`
    }
  }

  const unnecessary = body.unnecessary_questions_count
  if (
    unnecessary !== null &&
    (typeof unnecessary !== 'number' ||
      !Number.isInteger(unnecessary) ||
      unnecessary < 0 ||
      unnecessary > 50)
  ) {
    return 'unnecessary_questions_count must be null or an integer between 0 and 50.'
  }

  const flags = body.safety_flags
  if (!hasExactKeys(flags, SAFETY_FLAG_KEYS)) {
    return 'safety_flags must contain every flag key and nothing else.'
  }
  for (const key of SAFETY_FLAG_KEYS) {
    if (typeof (flags as Record<string, unknown>)[key] !== 'boolean') {
      return `safety_flags.${key} must be a boolean.`
    }
  }

  const verdict = body.doctor_verdict
  if (!hasExactKeys(verdict, ['triage_level', 'specialty', 'main_diagnosis'])) {
    return 'doctor_verdict must contain triage_level, specialty and main_diagnosis.'
  }
  const verdictRecord = verdict as Record<string, unknown>
  if (!TRIAGE_LEVELS.includes(verdictRecord.triage_level as (typeof TRIAGE_LEVELS)[number])) {
    return 'doctor_verdict.triage_level is not a valid triage level.'
  }
  if (!SPECIALTIES.includes(verdictRecord.specialty as (typeof SPECIALTIES)[number])) {
    return 'doctor_verdict.specialty is not a valid specialty.'
  }
  if (!isNullableString(verdictRecord.main_diagnosis)) {
    return 'doctor_verdict.main_diagnosis must be a string or null.'
  }

  const comments = body.comments
  if (!hasExactKeys(comments, COMMENT_KEYS)) {
    return 'comments must contain every comment key and nothing else.'
  }
  for (const key of COMMENT_KEYS) {
    if (!isNullableString((comments as Record<string, unknown>)[key])) {
      return `comments.${key} must be a string or null.`
    }
  }

  const comparison = body.comparison
  if (comparison !== null) {
    if (!hasExactKeys(comparison, ['compared_session_id', 'winner'])) {
      return 'comparison must contain compared_session_id and winner.'
    }
    const record = comparison as Record<string, unknown>
    if (typeof record.compared_session_id !== 'string' || record.compared_session_id === '') {
      return 'comparison.compared_session_id must be a non-empty string.'
    }
    if (record.winner !== 'this' && record.winner !== 'other' && record.winner !== 'tie') {
      return 'comparison.winner must be "this", "other" or "tie".'
    }
  }

  return null
}

/* ------------------------------------------------------------------ *
 * Admin metrics
 * ------------------------------------------------------------------ */

function buildMeanScores(seed: number): Record<ScoreKey, number | null> {
  return EVALUATION_SCORE_KEYS.reduce(
    (accumulator, key, index) => {
      accumulator[key] = 3 + ((seed + index) % 3) * 0.5
      return accumulator
    },
    {} as Record<ScoreKey, number | null>,
  )
}

function buildSafetyFlagCounts(seed: number): Record<SafetyFlagKey, number> {
  return SAFETY_FLAG_KEYS.reduce(
    (accumulator, key, index) => {
      accumulator[key] = (seed + index) % 3
      return accumulator
    },
    {} as Record<SafetyFlagKey, number>,
  )
}

function plausibleRow(
  key: string,
  label: string,
  architecture: string | null,
  model: string | null,
  seed: number,
): MetricsRow {
  return {
    key,
    label,
    architecture,
    model,
    sessions_total: 6 + (seed % 5),
    sessions_evaluated: 4 + (seed % 4),
    triage_exact_rate: 0.4 + (seed % 4) * 0.15,
    undertriage_rate: (seed % 3) * 0.05,
    undertriage_emergency_rate: (seed % 4) * 0.1,
    overtriage_rate: 0.05 + (seed % 3) * 0.05,
    insufficient_info_count: seed % 3,
    specialty_match_rate: 0.55 + (seed % 3) * 0.1,
    mean_scores: buildMeanScores(seed),
    safety_flag_counts: buildSafetyFlagCounts(seed),
    mean_questions: 4 + (seed % 5),
    turn_latency_p50_ms: 4_200 + seed * 380,
    turn_latency_p90_ms: 9_800 + seed * 900,
    mean_cost_usd: 0.0204 + seed * 0.0043,
    feedback_up: 5 + seed,
    feedback_down: seed % 4,
    pairwise: { wins: seed % 4, losses: (seed + 1) % 3, ties: seed % 2 },
    safety_floor_escalations: seed % 3,
  }
}

function metricsRows(groupBy: MetricsGroupBy): MetricsRow[] {
  if (groupBy === 'architecture') {
    return (['simple', 'structured'] as const).map((architecture, index) =>
      plausibleRow(architecture, architecture, architecture, null, index + 4),
    )
  }
  if (groupBy === 'model') {
    const models = [...new Set(MOCK_AGENT_SEEDS.map((seed) => seed.model))]
    return models.map((model, index) => plausibleRow(model, model, null, model, index + 2))
  }
  return MOCK_AGENTS.map((agent, index) => {
    const reveal = mockRevealFor(agent.id)
    return plausibleRow(agent.id, agent.display_name, reveal.architecture, reveal.model, index + 1)
  })
}

/* ------------------------------------------------------------------ *
 * CSV export
 * ------------------------------------------------------------------ */

function toCsv(header: string[], rows: string[][]): string {
  const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
}

function exportRows(table: ExportTable): { header: string[]; rows: string[][] } {
  const sessions = mockStore.all().slice(0, 40)

  switch (table) {
    case 'messages':
      return {
        header: ['session_id', 'seq', 'role', 'kind', 'text', 'created_at', 'latency_ms'],
        rows: sessions.flatMap((session) =>
          session.messages.map((message) => [
            session.id,
            String(message.seq),
            message.role,
            message.kind,
            message.text,
            message.created_at,
            message.latency_ms === null ? '' : String(message.latency_ms),
          ]),
        ),
      }
    case 'evaluations':
      return {
        header: [
          'session_id',
          'created_at',
          'triage_correctness',
          'overall_trust',
          'verdict_triage_level',
          'verdict_specialty',
          'unnecessary_questions',
        ],
        rows: sessions
          .filter((session) => session.evaluation !== null)
          .map((session) => {
            const evaluation = session.evaluation as Evaluation
            return [
              session.id,
              evaluation.created_at,
              String(evaluation.scores.triage_correctness),
              String(evaluation.scores.overall_trust),
              evaluation.doctor_verdict.triage_level,
              evaluation.doctor_verdict.specialty,
              evaluation.unnecessary_questions_count === null
                ? ''
                : String(evaluation.unnecessary_questions_count),
            ]
          }),
      }
    case 'feedback':
      return {
        header: ['session_id', 'message_id', 'rating', 'note', 'updated_at'],
        rows: sessions.flatMap((session) =>
          Object.values(session.feedback)
            .flat()
            .map((feedback) => [
              session.id,
              feedback.message_id,
              feedback.rating,
              feedback.note ?? '',
              feedback.updated_at,
            ]),
        ),
      }
    case 'llm_calls':
      return {
        header: ['session_id', 'agent_id', 'model', 'kind', 'latency_ms', 'cost_usd'],
        rows: sessions.flatMap((session) =>
          session.messages
            .filter((message) => message.role === 'agent' && message.kind !== 'greeting')
            .map((message) => [
              session.id,
              session.agent_id,
              mockRevealFor(session.agent_id).model,
              message.kind,
              message.latency_ms === null ? '' : String(message.latency_ms),
              '0.0021',
            ]),
        ),
      }
    case 'assessments':
      return {
        header: ['session_id', 'final_triage_level', 'raw_triage_level', 'confidence', 'actions'],
        rows: sessions
          .filter((session) => session.result !== null)
          .map((session) => {
            const result = session.result!
            return [
              session.id,
              result.assessment.triage_level,
              result.guard.raw_triage_level,
              result.assessment.confidence,
              result.guard.actions.join('|'),
            ]
          }),
      }
    case 'sessions':
    default:
      return {
        header: [
          'id',
          'agent_id',
          'user_id',
          'status',
          'end_reason',
          'questions_asked',
          'created_at',
          'completed_at',
          'evaluated',
          'final_triage_level',
        ],
        rows: sessions.map((session) => {
          const summary = toSummary(session)
          return [
            summary.id,
            session.agent_id,
            session.user_id,
            summary.status,
            summary.end_reason ?? '',
            String(summary.questions_asked),
            summary.created_at,
            summary.completed_at ?? '',
            String(summary.evaluated),
            summary.final_triage_level ?? '',
          ]
        }),
      }
  }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const handlers: RequestHandler[] = [
  /* ----------------------------- auth ---------------------------- */
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as
      | { username?: unknown; password?: unknown }
      | null
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const user = MOCK_USERS.find(
      (candidate) => candidate.username === username && candidate.password === password,
    )
    if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Wrong username or password.')
    return HttpResponse.json({
      access_token: mockToken(user.username),
      token_type: 'bearer',
      user: publicUser(user),
    })
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    return HttpResponse.json(publicUser(user))
  }),

  /* ---------------------------- agents --------------------------- */
  http.get(`${API}/agents`, ({ request }) => {
    if (!currentUser(request)) return unauthorized()
    return HttpResponse.json(MOCK_AGENTS)
  }),

  /* --------------------------- sessions -------------------------- */
  http.post(`${API}/sessions`, async ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const body = (await request.json().catch(() => null)) as { agent_id?: unknown } | null
    const agentId = typeof body?.agent_id === 'string' ? body.agent_id : ''
    const session = mockStore.createSession(user, agentId)
    if (!session) return notFound('Agent')
    return HttpResponse.json(toDetail(session, user), { status: 201 })
  }),

  http.get(`${API}/sessions`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const evaluated = url.searchParams.get('evaluated')
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const offset = Number(url.searchParams.get('offset') ?? '0')

    let items = mockStore.forUser(user.id)
    if (status) items = items.filter((session) => session.status === (status as SessionStatus))
    if (evaluated === 'true') items = items.filter((session) => session.evaluation !== null)
    if (evaluated === 'false') items = items.filter((session) => session.evaluation === null)

    const total = items.length
    const page = items.slice(offset, offset + (Number.isFinite(limit) ? limit : 50))
    return HttpResponse.json({ items: page.map(toSummary), total })
  }),

  http.get(`${API}/sessions/:sessionId`, ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.get(String(params.sessionId))
    if (!session) return notFound('Session')
    if (!isOwner(session, user)) return forbidden()
    return HttpResponse.json(toDetail(session, user))
  }),

  http.post(`${API}/sessions/:sessionId/messages`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.get(String(params.sessionId))
    if (!session) return notFound('Session')
    if (!isOwner(session, user)) return forbidden()

    const body = (await request.json().catch(() => null)) as { text?: unknown } | null
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (text.length === 0 || text.length > MAX_MESSAGE_LENGTH) {
      return validationError(`text must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`)
    }

    if (session.status === 'completed') {
      return errorResponse(409, 'SESSION_COMPLETED', 'This session is already completed.')
    }
    if (session.turn_in_progress) {
      return errorResponse(
        409,
        'TURN_IN_PROGRESS',
        'A turn is already being processed for this session.',
      )
    }

    session.turn_in_progress = true
    try {
      const patientMessage = mockStore.resolvePatientMessage(session, text)

      if (text.includes(MOCK_ERROR_TRIGGER)) {
        const agentMessage = appendMessage(session, 'agent', 'error', ERROR_FA, { latencyMs: 900 })
        return errorResponse(
          502,
          'AGENT_ERROR',
          'The language model failed after retries. The client may resend.',
          { patient_message: patientMessage, agent_message: agentMessage },
        )
      }

      await sleep(mockTurnDelayMs())

      const answeredCount = mockStore.patientMessageCount(session)
      if (answeredCount >= MOCK_CONCLUSION_AFTER_PATIENT_MESSAGES) {
        const { message } = mockStore.conclude(session, 'agent_concluded')
        const response: TurnResponse = {
          patient_message: patientMessage,
          agent_message: message,
          session: toDetail(session, user),
        }
        return HttpResponse.json(response)
      }

      const questionText =
        MOCK_FOLLOW_UP_QUESTIONS[(answeredCount - 1) % MOCK_FOLLOW_UP_QUESTIONS.length]
      const agentMessage = appendMessage(session, 'agent', 'question', questionText, {
        latencyMs: 3_000 + Math.round(Math.random() * 3_000),
      })

      const response: TurnResponse = {
        patient_message: patientMessage,
        agent_message: agentMessage,
        session: toDetail(session, user),
      }
      return HttpResponse.json(response)
    } finally {
      session.turn_in_progress = false
    }
  }),

  http.post(`${API}/sessions/:sessionId/finish`, ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.get(String(params.sessionId))
    if (!session) return notFound('Session')
    if (!isOwner(session, user)) return forbidden()
    if (session.status === 'completed') {
      return errorResponse(409, 'SESSION_COMPLETED', 'This session is already completed.')
    }
    if (session.turn_in_progress) {
      return errorResponse(
        409,
        'TURN_IN_PROGRESS',
        'A turn is already being processed for this session.',
      )
    }

    const { message } = mockStore.conclude(session, 'evaluator_ended')
    const response: TurnResponse = {
      patient_message: null,
      agent_message: message,
      session: toDetail(session, user),
    }
    return HttpResponse.json(response)
  }),

  /* ------------------- feedback and evaluation ------------------- */
  http.put(`${API}/messages/:messageId/feedback`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.ownerOfMessage(String(params.messageId))
    if (!session) return notFound('Message')
    if (!isOwner(session, user)) return forbidden()

    /* Contract order: unknown → 404 · not owner → 403 · wrong kind → 400 · evaluated → 409. */
    const message = session.messages.find((candidate) => candidate.id === String(params.messageId))
    if (!message || message.kind !== 'question' && message.kind !== 'result') {
      return validationError(
        'Feedback is only allowed on agent messages of kind question or result.',
      )
    }
    if (session.evaluation) {
      return errorResponse(409, 'EVALUATION_LOCKED', 'Feedback is read-only after evaluation.')
    }

    const body = (await request.json().catch(() => null)) as
      | { rating?: unknown; note?: unknown }
      | null
    const rating = body?.rating
    if (rating !== 'up' && rating !== 'down') {
      return validationError('rating must be "up" or "down".')
    }
    const note = typeof body?.note === 'string' ? body.note : null
    if (note !== null && note.length > MAX_NOTE_LENGTH) {
      return validationError(`note must be at most ${MAX_NOTE_LENGTH} characters.`)
    }

    const feedback: Feedback = {
      message_id: message.id,
      rating,
      note,
      updated_at: nowIso(),
    }
    const rows = session.feedback[user.id] ?? []
    const index = rows.findIndex((row) => row.message_id === message.id)
    if (index >= 0) rows[index] = feedback
    else rows.push(feedback)
    session.feedback[user.id] = rows

    return HttpResponse.json(feedback)
  }),

  http.delete(`${API}/messages/:messageId/feedback`, ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.ownerOfMessage(String(params.messageId))
    if (!session) return notFound('Message')
    if (!isOwner(session, user)) return forbidden()

    /* Same checks and order as PUT; deleting feedback that does not exist is an idempotent 204. */
    const message = session.messages.find((candidate) => candidate.id === String(params.messageId))
    if (!message || (message.kind !== 'question' && message.kind !== 'result')) {
      return validationError(
        'Feedback is only allowed on agent messages of kind question or result.',
      )
    }
    if (session.evaluation) {
      return errorResponse(409, 'EVALUATION_LOCKED', 'Feedback is read-only after evaluation.')
    }
    const rows = session.feedback[user.id] ?? []
    session.feedback[user.id] = rows.filter((row) => row.message_id !== String(params.messageId))
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/sessions/:sessionId/evaluation`, async ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    const session = mockStore.get(String(params.sessionId))
    if (!session) return notFound('Session')
    if (!isOwner(session, user)) return forbidden()

    /* The body is validated **before** the state checks (API_CONTRACT §6, v1.1). */
    const input = (await request.json().catch(() => null)) as EvaluationInput | null
    const problem = validateEvaluation(input)
    if (problem) return validationError(problem)
    const payload = input as EvaluationInput

    if (payload.comparison) {
      const compared = mockStore.get(payload.comparison.compared_session_id)
      if (
        !compared ||
        compared.id === session.id ||
        compared.status !== 'completed' ||
        compared.user_id !== user.id
      ) {
        return validationError(
          'comparison.compared_session_id must be one of your other completed sessions.',
        )
      }
    }

    if (session.status !== 'completed') {
      return errorResponse(409, 'SESSION_NOT_COMPLETED', 'The session is still active.')
    }
    if (session.evaluation) {
      return errorResponse(409, 'EVALUATION_LOCKED', 'This session was already evaluated.')
    }

    const evaluation: Evaluation = {
      ...payload,
      id: `evaluation-${session.id}`,
      session_id: session.id,
      created_at: nowIso(),
    }
    session.evaluation = evaluation
    return HttpResponse.json(evaluation, { status: 201 })
  }),

  /* ----------------------------- admin --------------------------- */
  http.get(`${API}/admin/sessions`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (user.role !== 'admin') return forbidden()

    const url = new URL(request.url)
    const agentId = url.searchParams.get('agent_id')
    const userId = url.searchParams.get('user_id')
    const status = url.searchParams.get('status')
    const evaluated = url.searchParams.get('evaluated')
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const offset = Number(url.searchParams.get('offset') ?? '0')

    let items = mockStore.all()
    if (agentId) items = items.filter((session) => session.agent_id === agentId)
    if (userId) items = items.filter((session) => session.user_id === userId)
    if (status) items = items.filter((session) => session.status === (status as SessionStatus))
    if (evaluated === 'true') items = items.filter((session) => session.evaluation !== null)
    if (evaluated === 'false') items = items.filter((session) => session.evaluation === null)

    const total = items.length
    const page = items.slice(offset, offset + (Number.isFinite(limit) ? limit : 50))
    const payload: AdminSessionSummary[] = page.map((session) => {
      const owner: User = publicUser(mockStore.userById(session.user_id) ?? MOCK_USERS[0])
      return { ...toSummary(session), user: owner, agent_reveal: mockRevealFor(session.agent_id) }
    })
    return HttpResponse.json({ items: payload, total })
  }),

  http.get(`${API}/admin/sessions/:sessionId`, ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (user.role !== 'admin') return forbidden()
    const session = mockStore.get(String(params.sessionId))
    if (!session) return notFound('Session')
    return HttpResponse.json(toDetail(session, user, { allUsersFeedback: true }))
  }),

  http.get(`${API}/admin/metrics`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (user.role !== 'admin') return forbidden()
    const url = new URL(request.url)
    const requested = url.searchParams.get('group_by')
    const groupBy: MetricsGroupBy =
      requested === 'architecture' || requested === 'model' ? requested : 'agent'
    const payload: MetricsResponse = {
      group_by: groupBy,
      rows: metricsRows(groupBy),
      generated_at: nowIso(),
    }
    return HttpResponse.json(payload)
  }),

  http.get(`${API}/admin/export/:table`, ({ request, params }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (user.role !== 'admin') return forbidden()
    const table = String(params.table ?? '').replace(/\.csv$/, '') as ExportTable
    const { header, rows } = exportRows(table)
    const csv = `\uFEFF${toCsv(header, rows)}`
    return new HttpResponse(csv, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    })
  }),

  http.post(`${API}/admin/agents/reload`, ({ request }) => {
    const user = currentUser(request)
    if (!user) return unauthorized()
    if (user.role !== 'admin') return forbidden()
    return HttpResponse.json({ loaded: 12, enabled: 8 })
  }),
]
