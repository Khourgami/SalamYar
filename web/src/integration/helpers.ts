/**
 * Shared helpers for the contract-conformance suite (`npm run test:int`).
 *
 * These tests run in a **node** environment against a live backend (the dev server or the real
 * API). They check that the wire format matches `../../docs/API_CONTRACT.md` v1.1 **exactly**:
 * missing keys, unknown keys, and enum values outside the contract all fail.
 */

import { expect } from 'vitest'

import {
  CONFIDENCE_LEVELS,
  CANT_MISS_STATUSES,
  END_REASONS,
  EVALUATION_SCORE_KEYS,
  GUARD_ACTIONS,
  GUARD_FLAGS,
  SAFETY_FLAG_KEYS,
  SESSION_STATUSES,
  TRIAGE_LEVELS,
} from '@/api/types'

/** Base URL of the backend under test. Override with `INTEGRATION_API_URL`. */
export function apiBaseUrl(): string {
  return (process.env.INTEGRATION_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '')
}

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  rawText: string
  /** Raw body bytes. `rawText` drops a leading UTF-8 BOM (like `Response.text()`); the CSV export
   * check needs the bytes, so keep them. */
  bytes: Uint8Array
  headers: Headers
}

export interface RequestOptions {
  method?: string
  token?: string
  body?: unknown
  /** Extra headers, e.g. `Content-Type` overrides for the CSV export. */
  headers?: Record<string, string>
}

/**
 * Perform a request and return the status/body instead of throwing on non-2xx. Never assumes the
 * database is empty: every test creates its own data.
 */
export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  // Read the bytes, not `response.text()`, so the CSV BOM survives for the export check.
  const bytes = new Uint8Array(await response.arrayBuffer())
  // A default TextDecoder strips a leading BOM, matching `Response.text()`.
  const rawText = new TextDecoder('utf-8').decode(bytes)
  let body: unknown = null
  if (rawText) {
    try {
      body = JSON.parse(rawText)
    } catch {
      body = rawText
    }
  }
  return {
    status: response.status,
    body: body as T,
    rawText,
    bytes,
    headers: response.headers,
  }
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export interface AuthedUser {
  token: string
  id: string
  username: string
  role: string
}

/** The dev server seeds these users; the tests never create them. */
export const USERS = {
  doctor: { username: 'doctor', password: 'doctor123' },
  doctor2: { username: 'doctor2', password: 'doctor123' },
  admin: { username: 'admin', password: 'admin123' },
} as const

export async function login(username: string, password: string): Promise<AuthedUser> {
  const response = await request<{
    access_token: string
    token_type: string
    user: { id: string; username: string; role: string }
  }>('/auth/login', { method: 'POST', body: { username, password } })
  expect(response.status, `login ${username}: ${response.rawText}`).toBe(200)
  return {
    token: response.body.access_token,
    id: response.body.user.id,
    username: response.body.user.username,
    role: response.body.user.role,
  }
}

/* ------------------------------------------------------------------ *
 * Key-set + enum assertions
 * ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fail on a missing required key **and** on any unknown key.
 *
 * @param label the type name, used in the failure message
 */
export function expectExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  label = 'object',
): Record<string, unknown> {
  expect(isRecord(value), `${label} must be an object, got ${JSON.stringify(value)}`).toBe(true)
  const object = value as Record<string, unknown>
  const present = Object.keys(object)
  const missing = required.filter((key) => !(key in object))
  const allowed = new Set([...required, ...optional])
  const unknown = present.filter((key) => !allowed.has(key))
  expect(missing, `${label}: missing keys ${missing.join(', ')}`).toEqual([])
  expect(unknown, `${label}: unknown keys ${unknown.join(', ')}`).toEqual([])
  return object
}

/** Assert an enum value is one of the contract's runtime values. */
export function expectEnum(value: unknown, allowed: readonly string[], label: string): void {
  expect(allowed, `${label}: unexpected value ${JSON.stringify(value)}`).toContain(value)
}

export function expectNullableString(value: unknown, label: string): void {
  expect(value === null || typeof value === 'string', `${label} must be string|null`).toBe(true)
}

/* ------------------------------------------------------------------ *
 * Contract key sets (hand-written from API_CONTRACT.md §2)
 * ------------------------------------------------------------------ */

export const KEYS = {
  User: { required: ['id', 'username', 'display_name', 'role'] },
  AgentPublic: { required: ['id', 'display_name', 'description'] },
  Message: { required: ['id', 'seq', 'role', 'kind', 'text', 'created_at', 'latency_ms'] },
  SessionSummary: {
    required: [
      'id',
      'agent',
      'status',
      'end_reason',
      'questions_asked',
      'created_at',
      'completed_at',
      'evaluated',
      'first_patient_message',
      'final_triage_level',
    ],
  },
  SessionDetailExtra: { required: ['messages', 'result', 'backstage', 'feedback', 'evaluation', 'reveal'] },
  TurnResponse: { required: ['patient_message', 'agent_message', 'session'] },
  ResultCard: { required: ['assessment', 'guard', 'stats'] },
  ResultStats: { required: ['questions_asked', 'duration_seconds', 'total_cost_usd', 'mean_turn_latency_ms'] },
  AssessmentResult: {
    required: [
      'triage_level',
      'emergency_probability',
      'specialty_primary',
      'specialty_secondary',
      'differential',
      'cant_miss',
      'missing_information',
      'confidence',
      'out_of_scope_pediatric',
      'patient_message',
      'clinical_summary',
    ],
  },
  ClinicalSummary: {
    required: [
      'chief_complaint',
      'history_of_present_illness',
      'relevant_history',
      'medications',
      'allergies',
      'pertinent_negatives',
      'assessment_rationale',
    ],
  },
  Hypothesis: { required: ['name_fa', 'name_en', 'probability', 'supporting', 'against'] },
  CantMiss: { required: ['name_fa', 'name_en', 'status', 'reason'] },
  GuardReport: { required: ['raw_triage_level', 'final_triage_level', 'actions', 'flags'] },
  /** Every `BackstageTurn` field is optional. */
  BackstageTurn: {
    required: [],
    optional: [
      'message_id',
      'reasoning_note',
      'clinical_state',
      'hypotheses',
      'cant_miss',
      'emergency_probability',
      'next_action',
      'stop_reason',
      'question_rationale',
    ],
  },
  Feedback: { required: ['message_id', 'rating', 'note', 'updated_at'] },
  Evaluation: {
    required: [
      'id',
      'session_id',
      'created_at',
      'scores',
      'unnecessary_questions_count',
      'safety_flags',
      'doctor_verdict',
      'comments',
      'comparison',
    ],
  },
  AgentReveal: { required: ['architecture', 'model', 'config'] },
  AgentRevealConfig: {
    required: [
      'max_questions',
      'safety_floor',
      'emergency_threshold',
      'reasoning_effort',
      'temperature',
      'prompt_version',
    ],
  },
  MetricsRow: {
    required: [
      'key',
      'label',
      'architecture',
      'model',
      'sessions_total',
      'sessions_evaluated',
      'triage_exact_rate',
      'undertriage_rate',
      'undertriage_emergency_rate',
      'overtriage_rate',
      'insufficient_info_count',
      'specialty_match_rate',
      'mean_scores',
      'safety_flag_counts',
      'mean_questions',
      'turn_latency_p50_ms',
      'turn_latency_p90_ms',
      'mean_cost_usd',
      'feedback_up',
      'feedback_down',
      'pairwise',
      'safety_floor_escalations',
    ],
  },
} as const

/* ------------------------------------------------------------------ *
 * Composite validators
 * ------------------------------------------------------------------ */

export function expectUser(value: unknown): void {
  const user = expectExactKeys(value, KEYS.User.required, [], 'User')
  expect(typeof user.id).toBe('string')
  expect(typeof user.username).toBe('string')
  expect(typeof user.display_name).toBe('string')
  expectEnum(user.role, ['evaluator', 'admin'], 'User.role')
}

export function expectAgentPublic(value: unknown): void {
  const agent = expectExactKeys(value, KEYS.AgentPublic.required, [], 'AgentPublic')
  expect(typeof agent.id).toBe('string')
  expect(typeof agent.display_name).toBe('string')
  expectNullableString(agent.description, 'AgentPublic.description')
}

export function expectAgentReveal(value: unknown): void {
  const reveal = expectExactKeys(value, KEYS.AgentReveal.required, [], 'AgentReveal')
  expectEnum(reveal.architecture, ['simple', 'structured'], 'AgentReveal.architecture')
  expect(typeof reveal.model).toBe('string')
  const config = expectExactKeys(
    reveal.config,
    KEYS.AgentRevealConfig.required,
    [],
    'AgentReveal.config',
  )
  expect(typeof config.max_questions).toBe('number')
  expect(typeof config.safety_floor).toBe('boolean')
  expect(typeof config.emergency_threshold).toBe('number')
  expectNullableString(config.reasoning_effort, 'AgentReveal.config.reasoning_effort')
  expect(config.temperature === null || typeof config.temperature === 'number').toBe(true)
  expect(typeof config.prompt_version).toBe('string')
}

export function expectMessage(value: unknown): void {
  const message = expectExactKeys(value, KEYS.Message.required, [], 'Message')
  expect(typeof message.id).toBe('string')
  expect(typeof message.seq).toBe('number')
  expectEnum(message.role, ['agent', 'patient'], 'Message.role')
  expectEnum(message.kind, ['greeting', 'question', 'result', 'error', 'text'], 'Message.kind')
  expect(typeof message.text).toBe('string')
  expect(typeof message.created_at).toBe('string')
  expect(message.latency_ms === null || typeof message.latency_ms === 'number').toBe(true)
}

export function expectSessionSummary(value: unknown, extraKeys: readonly string[] = []): void {
  const session = expectExactKeys(
    value,
    KEYS.SessionSummary.required,
    extraKeys,
    'SessionSummary',
  )
  expect(typeof session.id).toBe('string')
  expectAgentPublic(session.agent)
  expectEnum(session.status, SESSION_STATUSES, 'SessionSummary.status')
  expect(
    session.end_reason === null || END_REASONS.includes(session.end_reason as never),
    `SessionSummary.end_reason: ${JSON.stringify(session.end_reason)}`,
  ).toBe(true)
  expect(typeof session.questions_asked).toBe('number')
  expect(typeof session.created_at).toBe('string')
  expectNullableString(session.completed_at, 'SessionSummary.completed_at')
  expect(typeof session.evaluated).toBe('boolean')
  expectNullableString(session.first_patient_message, 'SessionSummary.first_patient_message')
  if (session.final_triage_level !== null) {
    expectEnum(session.final_triage_level, TRIAGE_LEVELS, 'SessionSummary.final_triage_level')
  }
}

export function expectClinicalSummary(value: unknown): void {
  const summary = expectExactKeys(value, KEYS.ClinicalSummary.required, [], 'ClinicalSummary')
  for (const key of KEYS.ClinicalSummary.required) {
    expect(typeof summary[key], `ClinicalSummary.${key}`).toBe('string')
  }
}

export function expectHypothesis(value: unknown): void {
  const hypothesis = expectExactKeys(value, KEYS.Hypothesis.required, [], 'Hypothesis')
  expect(typeof hypothesis.name_fa).toBe('string')
  expect(typeof hypothesis.name_en).toBe('string')
  expect(typeof hypothesis.probability).toBe('number')
  expect(Array.isArray(hypothesis.supporting)).toBe(true)
  expect(Array.isArray(hypothesis.against)).toBe(true)
}

export function expectCantMiss(value: unknown): void {
  const cantMiss = expectExactKeys(value, KEYS.CantMiss.required, [], 'CantMiss')
  expect(typeof cantMiss.name_fa).toBe('string')
  expect(typeof cantMiss.name_en).toBe('string')
  expectEnum(cantMiss.status, CANT_MISS_STATUSES, 'CantMiss.status')
  expect(typeof cantMiss.reason).toBe('string')
}

export function expectAssessmentResult(value: unknown): void {
  const assessment = expectExactKeys(value, KEYS.AssessmentResult.required, [], 'AssessmentResult')
  expectEnum(assessment.triage_level, TRIAGE_LEVELS, 'AssessmentResult.triage_level')
  expect(typeof assessment.emergency_probability).toBe('number')
  expect(typeof assessment.specialty_primary).toBe('string')
  expectNullableString(assessment.specialty_secondary, 'AssessmentResult.specialty_secondary')
  expect(Array.isArray(assessment.differential)).toBe(true)
  ;(assessment.differential as unknown[]).forEach(expectHypothesis)
  expect(Array.isArray(assessment.cant_miss)).toBe(true)
  ;(assessment.cant_miss as unknown[]).forEach(expectCantMiss)
  expect(Array.isArray(assessment.missing_information)).toBe(true)
  expectEnum(assessment.confidence, CONFIDENCE_LEVELS, 'AssessmentResult.confidence')
  expect(typeof assessment.out_of_scope_pediatric).toBe('boolean')
  expect(typeof assessment.patient_message).toBe('string')
  expectClinicalSummary(assessment.clinical_summary)
}

export function expectGuardReport(value: unknown): void {
  const guard = expectExactKeys(value, KEYS.GuardReport.required, [], 'GuardReport')
  expectEnum(guard.raw_triage_level, TRIAGE_LEVELS, 'GuardReport.raw_triage_level')
  expectEnum(guard.final_triage_level, TRIAGE_LEVELS, 'GuardReport.final_triage_level')
  expect(Array.isArray(guard.actions)).toBe(true)
  ;(guard.actions as unknown[]).forEach((action) => expectEnum(action, GUARD_ACTIONS, 'GuardReport.actions[]'))
  expect(Array.isArray(guard.flags)).toBe(true)
  ;(guard.flags as unknown[]).forEach((flag) => expectEnum(flag, GUARD_FLAGS, 'GuardReport.flags[]'))
}

export function expectResultCard(value: unknown): void {
  const card = expectExactKeys(value, KEYS.ResultCard.required, [], 'ResultCard')
  expectAssessmentResult(card.assessment)
  expectGuardReport(card.guard)
  const stats = expectExactKeys(card.stats, KEYS.ResultStats.required, [], 'ResultCard.stats')
  expect(typeof stats.questions_asked).toBe('number')
  expect(typeof stats.duration_seconds).toBe('number')
  expect(stats.total_cost_usd === null || typeof stats.total_cost_usd === 'number').toBe(true)
  expect(stats.mean_turn_latency_ms === null || typeof stats.mean_turn_latency_ms === 'number').toBe(
    true,
  )
}

export function expectBackstageTurn(value: unknown): void {
  const turn = expectExactKeys(
    value,
    KEYS.BackstageTurn.required,
    KEYS.BackstageTurn.optional,
    'BackstageTurn',
  )
  if ('message_id' in turn) expect(typeof turn.message_id).toBe('string')
  if ('reasoning_note' in turn) expect(typeof turn.reasoning_note).toBe('string')
  if ('hypotheses' in turn && turn.hypotheses !== undefined) {
    expect(Array.isArray(turn.hypotheses)).toBe(true)
    ;(turn.hypotheses as unknown[]).forEach(expectHypothesis)
  }
  if ('cant_miss' in turn && turn.cant_miss !== undefined) {
    expect(Array.isArray(turn.cant_miss)).toBe(true)
    ;(turn.cant_miss as unknown[]).forEach(expectCantMiss)
  }
  if ('next_action' in turn && turn.next_action !== undefined) {
    expectEnum(turn.next_action, ['ask', 'clarify', 'conclude'], 'BackstageTurn.next_action')
  }
  if ('emergency_probability' in turn && turn.emergency_probability !== undefined) {
    expect(typeof turn.emergency_probability).toBe('number')
  }
  if ('stop_reason' in turn) expectNullableString(turn.stop_reason, 'BackstageTurn.stop_reason')
  if ('question_rationale' in turn) expect(typeof turn.question_rationale).toBe('string')
}

export function expectFeedback(value: unknown): void {
  const feedback = expectExactKeys(value, KEYS.Feedback.required, [], 'Feedback')
  expect(typeof feedback.message_id).toBe('string')
  expectEnum(feedback.rating, ['up', 'down'], 'Feedback.rating')
  expectNullableString(feedback.note, 'Feedback.note')
  expect(typeof feedback.updated_at).toBe('string')
}

export function expectEvaluation(value: unknown): void {
  const evaluation = expectExactKeys(value, KEYS.Evaluation.required, [], 'Evaluation')
  expect(typeof evaluation.id).toBe('string')
  expect(typeof evaluation.session_id).toBe('string')
  expect(typeof evaluation.created_at).toBe('string')

  const scores = expectExactKeys(evaluation.scores, EVALUATION_SCORE_KEYS, [], 'Evaluation.scores')
  for (const key of EVALUATION_SCORE_KEYS) expect(typeof scores[key], `scores.${key}`).toBe('number')

  expect(
    evaluation.unnecessary_questions_count === null ||
      typeof evaluation.unnecessary_questions_count === 'number',
  ).toBe(true)

  const flags = expectExactKeys(evaluation.safety_flags, SAFETY_FLAG_KEYS, [], 'Evaluation.safety_flags')
  for (const key of SAFETY_FLAG_KEYS) expect(typeof flags[key], `safety_flags.${key}`).toBe('boolean')

  const verdict = expectExactKeys(
    evaluation.doctor_verdict,
    ['triage_level', 'specialty', 'main_diagnosis'],
    [],
    'Evaluation.doctor_verdict',
  )
  expectEnum(verdict.triage_level, TRIAGE_LEVELS, 'doctor_verdict.triage_level')
  expect(typeof verdict.specialty).toBe('string')
  expectNullableString(verdict.main_diagnosis, 'doctor_verdict.main_diagnosis')

  expectExactKeys(
    evaluation.comments,
    ['strengths', 'weaknesses', 'missed_questions', 'general'],
    [],
    'Evaluation.comments',
  )

  if (evaluation.comparison !== null) {
    const comparison = expectExactKeys(
      evaluation.comparison,
      ['compared_session_id', 'winner'],
      [],
      'Evaluation.comparison',
    )
    expect(typeof comparison.compared_session_id).toBe('string')
    expectEnum(comparison.winner, ['this', 'other', 'tie'], 'comparison.winner')
  }
}

export function expectSessionDetail(value: unknown): void {
  // `SessionDetail` is `SessionSummary` plus the extra keys, so validate the summary while
  // allowing the detail-only keys, then validate each of them.
  expectSessionSummary(value, KEYS.SessionDetailExtra.required)
  const session = expectExactKeys(
    value,
    KEYS.SessionDetailExtra.required,
    KEYS.SessionSummary.required,
    'SessionDetail',
  )
  expect(Array.isArray(session.messages)).toBe(true)
  ;(session.messages as unknown[]).forEach(expectMessage)
  if (session.result !== null) expectResultCard(session.result)
  if (session.backstage !== null) {
    expect(Array.isArray(session.backstage)).toBe(true)
    ;(session.backstage as unknown[]).forEach(expectBackstageTurn)
  }
  expect(Array.isArray(session.feedback)).toBe(true)
  ;(session.feedback as unknown[]).forEach(expectFeedback)
  if (session.evaluation !== null) expectEvaluation(session.evaluation)
  if (session.reveal !== null) expectAgentReveal(session.reveal)
}

export function expectErrorBody(value: unknown, code?: string): void {
  const body = expectExactKeys(value, ['error'], [], 'error body')
  const error = expectExactKeys(body.error, ['code', 'message'], [], 'error')
  expect(typeof error.code).toBe('string')
  expect(typeof error.message).toBe('string')
  if (code) expect(error.code).toBe(code)
}

/* ------------------------------------------------------------------ *
 * Session helpers
 * ------------------------------------------------------------------ */

/** Create a session for one agent whose id starts with `prefix` (`a-` / `b-`). */
export async function createSessionFor(
  token: string,
  prefix: 'a-' | 'b-',
): Promise<{ id: string; agentId: string }> {
  const agents = await request<unknown[]>('/agents', { token })
  expect(agents.status, `GET /agents: ${agents.rawText}`).toBe(200)
  const agent = (agents.body as { id: string }[]).find((entry) => entry.id.startsWith(prefix))
  expect(agent, `no agent with prefix ${prefix}`).toBeTruthy()
  const created = await request<{ id: string }>('/sessions', {
    method: 'POST',
    token,
    body: { agent_id: agent!.id },
  })
  expect(created.status, `POST /sessions: ${created.rawText}`).toBe(201)
  return { id: created.body.id, agentId: agent!.id }
}

export interface CompletedSession {
  id: string
  detail: Record<string, unknown>
}

/**
 * Drive a session to completion by sending patient messages until the agent concludes.
 * Returns the completed `SessionDetail`. Uses at most 15 patient messages.
 */
export async function completeSession(
  token: string,
  sessionId: string,
  messages: string[] = [],
): Promise<CompletedSession> {
  let detail: Record<string, unknown> | null = null
  for (let i = 0; i < 15; i += 1) {
    const text = messages[i] ?? `شرح شماره ${i + 1}: از دیشب احساس ناخوشی دارم.`
    const turn = await request<{ session: Record<string, unknown> }>(
      `/sessions/${sessionId}/messages`,
      { method: 'POST', token, body: { text } },
    )
    expect([200], `turn ${i + 1}: ${turn.status} ${turn.rawText}`).toContain(turn.status)
    detail = turn.body.session
    if (detail.status === 'completed') break
  }
  expect(detail, 'session never completed within 15 messages').toBeTruthy()
  expect(detail!.status).toBe('completed')
  return { id: sessionId, detail: detail! }
}

/** Build a valid `EvaluationInput`; `overrides` can remove keys or change values. */
export function evaluationInput(
  overrides: Partial<{
    scores: Record<string, number>
    unnecessary_questions_count: number | null
    safety_flags: Record<string, boolean>
    doctor_verdict: { triage_level: string; specialty: string; main_diagnosis: string | null }
    comments: Record<string, string | null>
    comparison: { compared_session_id: string; winner: string } | null
  }> = {},
): Record<string, unknown> {
  const scores: Record<string, number> = {}
  for (const key of EVALUATION_SCORE_KEYS) scores[key] = 3
  const safetyFlags: Record<string, boolean> = {}
  for (const key of SAFETY_FLAG_KEYS) safetyFlags[key] = false
  return {
    scores: { ...scores, ...overrides.scores },
    unnecessary_questions_count: overrides.unnecessary_questions_count ?? null,
    safety_flags: { ...safetyFlags, ...overrides.safety_flags },
    doctor_verdict: overrides.doctor_verdict ?? {
      triage_level: 'ROUTINE_DAYS',
      specialty: 'general_practice',
      main_diagnosis: null,
    },
    comments: overrides.comments ?? {
      strengths: null,
      weaknesses: null,
      missed_questions: null,
      general: null,
    },
    comparison: overrides.comparison ?? null,
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
