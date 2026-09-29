import type { SessionDetail } from '@/api/types'
import { MOCK_USERS } from '@/mocks/data'
import { createFixtureSessions } from '@/mocks/fixtures'
import { toDetail } from '@/mocks/model'

/** The `doctor` user the seeded fixtures belong to. */
export const FIXTURE_VIEWER = MOCK_USERS[0]

/** A fresh copy of a seeded session, serialised exactly like `GET /sessions/{id}`. */
export function fixtureDetail(sessionId: string): SessionDetail {
  const session = createFixtureSessions().find((candidate) => candidate.id === sessionId)
  if (!session) throw new Error(`Unknown fixture session: ${sessionId}`)
  return toDetail(session, FIXTURE_VIEWER)
}
