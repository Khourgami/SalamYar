/**
 * Stateful in-memory store for the MSW mocks. It lives for the lifetime of the page (and is
 * reset between tests through `mockStore.reset()`).
 */

import type { AgentPublic, Message } from '@/api/types'
import { GREETING_FA, MOCK_USERS, mockAgentById, newId, nowIso } from '@/mocks/data'
import type { MockUserRecord } from '@/mocks/data'
import { buildAbdominalPainCase, completeSession, createFixtureSessions } from '@/mocks/fixtures'
import type { MockCase } from '@/mocks/fixtures'
import type { StoredSession } from '@/mocks/model'
import { appendMessage, countQuestions, findUnansweredPatientMessage, patientMessages } from '@/mocks/model'

function activeSessionShell(
  userId: string,
  agentId: string,
  agent: AgentPublic,
  createdAt: string,
): StoredSession {
  return {
    id: newId(),
    user_id: userId,
    agent_id: agentId,
    agent,
    status: 'active',
    end_reason: null,
    created_at: createdAt,
    completed_at: null,
    messages: [],
    result: null,
    backstage: null,
    feedback: {},
    evaluation: null,
    turn_in_progress: false,
  }
}

class MockStore {
  private sessions = new Map<string, StoredSession>()

  constructor() {
    this.reset()
  }

  /** Drop everything and re-seed the fixtures. */
  reset(): void {
    this.sessions = new Map(createFixtureSessions().map((session) => [session.id, session]))
  }

  all(): StoredSession[] {
    return [...this.sessions.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  get(sessionId: string): StoredSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  forUser(userId: string): StoredSession[] {
    return this.all().filter((session) => session.user_id === userId)
  }

  add(session: StoredSession): StoredSession {
    this.sessions.set(session.id, session)
    return session
  }

  /** Find the session that owns a message (feedback endpoints are keyed by message id). */
  ownerOfMessage(messageId: string): StoredSession | null {
    for (const session of this.sessions.values()) {
      if (session.messages.some((message) => message.id === messageId)) return session
    }
    return null
  }

  createSession(user: MockUserRecord, agentId: string): StoredSession | null {
    const agent = mockAgentById(agentId)
    if (!agent) return null
    const session = activeSessionShell(user.id, agentId, agent, nowIso())
    appendMessage(session, 'agent', 'greeting', GREETING_FA, { createdAt: session.created_at })
    return this.add(session)
  }

  userById(userId: string): MockUserRecord | null {
    return MOCK_USERS.find((user) => user.id === userId) ?? null
  }

  /** The transcript input for the next turn, honouring the contract's resend rule. */
  resolvePatientMessage(session: StoredSession, text: string): Message {
    const unanswered = findUnansweredPatientMessage(session)
    if (unanswered && unanswered.text === text) return unanswered
    return appendMessage(session, 'patient', 'text', text)
  }

  patientMessageCount(session: StoredSession): number {
    return patientMessages(session).length
  }

  /** Finish the session with the mock result card and return the message that was appended. */
  conclude(
    session: StoredSession,
    endReason: 'agent_concluded' | 'max_questions' | 'evaluator_ended',
  ): { message: Message; mockCase: MockCase } {
    const mockCase = buildAbdominalPainCase(session.agent_id)
    completeSession(session, mockCase, {
      endReason,
      completedAt: nowIso(),
      latencyMs: 4_200 + Math.round(Math.random() * 2_000),
    })
    const message = session.messages[session.messages.length - 1]
    return { message, mockCase }
  }

  questionCount(session: StoredSession): number {
    return countQuestions(session)
  }
}

export const mockStore = new MockStore()
