/**
 * In-memory model of a mock session, plus the pure helpers that turn it into the contract
 * response types. Kept separate from `store.ts` so `fixtures.ts` can build sessions without a
 * circular import.
 */

import type {
  AgentPublic,
  AgentReveal,
  BackstageTurn,
  EndReason,
  Evaluation,
  Feedback,
  Message,
  MessageKind,
  MessageRole,
  ResultCard,
  SessionDetail,
  SessionStatus,
  SessionSummary,
} from '@/api/types'
import type { MockUserRecord } from '@/mocks/data'
import { mockRevealFor, nowIso, newId } from '@/mocks/data'

export interface StoredSession {
  id: string
  /** Owner. */
  user_id: string
  agent_id: string
  agent: AgentPublic
  status: SessionStatus
  end_reason: EndReason | null
  created_at: string
  completed_at: string | null
  messages: Message[]
  result: ResultCard | null
  backstage: BackstageTurn[] | null
  /** viewer user id → that viewer's feedback rows */
  feedback: Record<string, Feedback[]>
  evaluation: Evaluation | null
  turn_in_progress: boolean
}

export function appendMessage(
  session: StoredSession,
  role: MessageRole,
  kind: MessageKind,
  text: string,
  options: { latencyMs?: number | null; createdAt?: string } = {},
): Message {
  const message: Message = {
    id: newId(),
    seq: session.messages.length + 1,
    role,
    kind,
    text,
    created_at: options.createdAt ?? nowIso(),
    latency_ms: options.latencyMs ?? null,
  }
  session.messages.push(message)
  return message
}

export function countQuestions(session: StoredSession): number {
  return session.messages.filter(
    (message) => message.role === 'agent' && message.kind === 'question',
  ).length
}

export function patientMessages(session: StoredSession): Message[] {
  return session.messages.filter((message) => message.role === 'patient')
}

/**
 * The last patient message when the agent has not answered it yet (an `error` message in between
 * still counts as unanswered). Used for the contract's resend rule.
 */
export function findUnansweredPatientMessage(session: StoredSession): Message | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role === 'patient') return message
    if (message.role === 'agent' && (message.kind === 'question' || message.kind === 'result')) {
      return null
    }
  }
  return null
}

export function isEvaluated(session: StoredSession): boolean {
  return session.evaluation !== null
}

export function revealFor(session: StoredSession, viewer: MockUserRecord): AgentReveal | null {
  if (isEvaluated(session) || viewer.role === 'admin') return mockRevealFor(session.agent_id)
  return null
}

/**
 * v1.2 (D-035) — cost, tokens and call count are `null` for a non-admin caller until the session
 * is evaluated: they would hint at the model tier and the architecture. Admins always see them.
 * Only the five hidden fields are masked; the other three stats stay visible.
 */
export function resultFor(session: StoredSession, viewer: MockUserRecord): ResultCard | null {
  const result = session.result
  if (!result) return null
  if (isEvaluated(session) || viewer.role === 'admin') return result
  return {
    ...result,
    stats: {
      ...result.stats,
      total_cost_usd: null,
      llm_calls: null,
      prompt_tokens: null,
      completion_tokens: null,
      reasoning_tokens: null,
    },
  }
}

export function feedbackFor(session: StoredSession, userId: string): Feedback[] {
  return session.feedback[userId] ?? []
}

export function allFeedback(session: StoredSession): Feedback[] {
  return Object.values(session.feedback).flat()
}

export function upsertFeedback(session: StoredSession, userId: string, feedback: Feedback): void {
  const rows = session.feedback[userId] ?? []
  const index = rows.findIndex((row) => row.message_id === feedback.message_id)
  if (index >= 0) rows[index] = feedback
  else rows.push(feedback)
  session.feedback[userId] = rows
}

export function removeFeedback(session: StoredSession, userId: string, messageId: string): boolean {
  const rows = session.feedback[userId] ?? []
  const next = rows.filter((row) => row.message_id !== messageId)
  session.feedback[userId] = next
  return next.length !== rows.length
}

export function toSummary(session: StoredSession): SessionSummary {
  const firstPatientMessage = session.messages.find((message) => message.role === 'patient')
  return {
    id: session.id,
    agent: session.agent,
    status: session.status,
    end_reason: session.end_reason,
    questions_asked: countQuestions(session),
    created_at: session.created_at,
    completed_at: session.completed_at,
    evaluated: isEvaluated(session),
    first_patient_message: firstPatientMessage?.text ?? null,
    final_triage_level: session.result?.guard.final_triage_level ?? null,
  }
}

export function toDetail(
  session: StoredSession,
  viewer: MockUserRecord,
  options: { allUsersFeedback?: boolean } = {},
): SessionDetail {
  return {
    ...toSummary(session),
    messages: session.messages,
    result: resultFor(session, viewer),
    backstage: session.backstage,
    feedback: options.allUsersFeedback ? allFeedback(session) : feedbackFor(session, viewer.id),
    evaluation: session.evaluation,
    reveal: revealFor(session, viewer),
  }
}
