/**
 * The session page keeps one cached `SessionDetail` per id under `["session", id]`.
 * `POST /sessions/{id}/messages` and `/finish` both return the full updated session, so a turn is
 * a single cache write instead of a refetch.
 */

import type { QueryClient } from '@tanstack/react-query'

import type { AgentErrorBody, Feedback, Message, SessionDetail } from '@/api/types'

export function sessionQueryKey(sessionId: string) {
  return ['session', sessionId] as const
}

export function sessionsListQueryKey() {
  return ['sessions'] as const
}

export function readSession(
  queryClient: QueryClient,
  sessionId: string,
): SessionDetail | undefined {
  return queryClient.getQueryData<SessionDetail>(sessionQueryKey(sessionId))
}

export function writeSession(
  queryClient: QueryClient,
  sessionId: string,
  session: SessionDetail,
): void {
  queryClient.setQueryData(sessionQueryKey(sessionId), session)
}

export function updateSession(
  queryClient: QueryClient,
  sessionId: string,
  updater: (session: SessionDetail) => SessionDetail,
): void {
  const current = readSession(queryClient, sessionId)
  if (current) queryClient.setQueryData(sessionQueryKey(sessionId), updater(current))
}

/**
 * A 502 `AGENT_ERROR` saved the patient message and appended an `error` agent message, but the
 * response is an error body rather than a `TurnResponse`. Fold both into the cached session.
 */
export function appendAgentErrorMessages(
  session: SessionDetail,
  body: AgentErrorBody,
): SessionDetail {
  const known = new Set(session.messages.map((message) => message.id))
  const messages = [...session.messages]
  if (!known.has(body.patient_message.id)) messages.push(body.patient_message)
  if (!known.has(body.agent_message.id)) messages.push(body.agent_message)
  return { ...session, messages }
}

export function replaceFeedback(session: SessionDetail, row: Feedback): SessionDetail {
  const others = session.feedback.filter((feedback) => feedback.message_id !== row.message_id)
  return { ...session, feedback: [...others, row] }
}

export function dropFeedback(session: SessionDetail, messageId: string): SessionDetail {
  return {
    ...session,
    feedback: session.feedback.filter((feedback) => feedback.message_id !== messageId),
  }
}

export function findFeedback(session: SessionDetail, messageId: string): Feedback | undefined {
  return session.feedback.find((feedback) => feedback.message_id === messageId)
}

/** The text the `ارسال دوباره` button resends. */
export function lastPatientText(session: SessionDetail): string | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message: Message | undefined = session.messages[index]
    if (message && message.role === 'patient') return message.text
  }
  return null
}

/** Per-message feedback becomes read-only once the evaluation is submitted. */
export function isFeedbackLocked(session: SessionDetail): boolean {
  return session.evaluation !== null
}
