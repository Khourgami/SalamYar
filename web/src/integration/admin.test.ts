import { beforeAll, describe, expect, it } from 'vitest'

import {
  EVALUATION_SCORE_KEYS,
  EXPORT_TABLES,
  METRICS_GROUP_BY,
  SAFETY_FLAG_KEYS,
} from '@/api/types'

import {
  KEYS,
  USERS,
  expectExactKeys,
  expectErrorBody,
  login,
  request,
} from './helpers'

import type { AuthedUser } from './helpers'
import type { MetricsRow } from '@/api/types'

function expectMetricsRow(value: unknown): void {
  const row = expectExactKeys(value, KEYS.MetricsRow.required, [], 'MetricsRow')
  expect(typeof row.key).toBe('string')
  expect(typeof row.label).toBe('string')
  expect(row.architecture === null || typeof row.architecture === 'string').toBe(true)
  expect(row.model === null || typeof row.model === 'string').toBe(true)
  for (const key of [
    'sessions_total',
    'sessions_evaluated',
    'insufficient_info_count',
    'feedback_up',
    'feedback_down',
    'safety_floor_escalations',
  ]) {
    expect(typeof row[key], `MetricsRow.${key}`).toBe('number')
  }
  const scores = expectExactKeys(row.mean_scores, EVALUATION_SCORE_KEYS, [], 'MetricsRow.mean_scores')
  for (const key of EVALUATION_SCORE_KEYS) {
    expect(scores[key] === null || typeof scores[key] === 'number', `mean_scores.${key}`).toBe(true)
  }
  const flags = expectExactKeys(
    row.safety_flag_counts,
    SAFETY_FLAG_KEYS,
    [],
    'MetricsRow.safety_flag_counts',
  )
  for (const key of SAFETY_FLAG_KEYS) expect(typeof flags[key], `safety_flag_counts.${key}`).toBe('number')
  expectExactKeys(row.pairwise, ['wins', 'losses', 'ties'], [], 'MetricsRow.pairwise')
}

/** Scenarios 13–15: admin metrics, CSV export, and the agent-config reload. */
describe('T2 · scenario 13 — GET /admin/metrics', () => {
  let admin: AuthedUser

  beforeAll(async () => {
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  for (const groupBy of METRICS_GROUP_BY) {
    it(`echoes group_by=${groupBy} and matches MetricsRow`, async () => {
      const response = await request<{ group_by: string; rows: unknown[]; generated_at: string }>(
        `/admin/metrics?group_by=${groupBy}`,
        { token: admin.token },
      )

      expect(response.status, response.rawText).toBe(200)
      expectExactKeys(response.body, ['group_by', 'rows', 'generated_at'], [], 'MetricsResponse')
      expect(response.body.group_by).toBe(groupBy)
      expect(typeof response.body.generated_at).toBe('string')
      expect(Array.isArray(response.body.rows)).toBe(true)
      response.body.rows.forEach(expectMetricsRow)

      for (const row of response.body.rows as MetricsRow[]) {
        if (groupBy === 'architecture') expect(row.model).toBeNull()
        if (groupBy === 'model') expect(row.architecture).toBeNull()
      }
    })
  }

  it('rejects a non-admin caller with 403', async () => {
    const doctor = await login(USERS.doctor.username, USERS.doctor.password)
    const response = await request('/admin/metrics', { token: doctor.token })
    expect(response.status).toBe(403)
    expectErrorBody(response.body, 'FORBIDDEN')
  })
})

describe('T2 · scenario 14 — GET /admin/export/{table}.csv', () => {
  let admin: AuthedUser

  beforeAll(async () => {
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  for (const table of EXPORT_TABLES) {
    it(`${table}.csv is 200 text/csv with a UTF-8 BOM`, async () => {
      const response = await request(`/admin/export/${table}.csv`, { token: admin.token })

      expect(response.status, response.rawText.slice(0, 200)).toBe(200)
      expect(response.headers.get('content-type') ?? '').toContain('text/csv')
      // `rawText` strips the BOM (TextDecoder default); inspect the raw bytes instead.
      expect(
        Array.from(response.bytes.slice(0, 3)),
        `${table}.csv starts with a UTF-8 BOM`,
      ).toEqual([0xef, 0xbb, 0xbf])
    })
  }
})

describe('T2 · scenario 15 — POST /admin/agents/reload', () => {
  let admin: AuthedUser

  beforeAll(async () => {
    admin = await login(USERS.admin.username, USERS.admin.password)
  })

  it('returns numeric `loaded` and `enabled`', async () => {
    const response = await request('/admin/agents/reload', {
      method: 'POST',
      token: admin.token,
      body: {},
    })

    expect(response.status, response.rawText).toBe(200)
    const body = expectExactKeys(response.body, ['loaded', 'enabled'], [], 'ReloadResponse')
    expect(typeof body.loaded).toBe('number')
    expect(typeof body.enabled).toBe('number')
    expect(body.enabled as number).toBeLessThanOrEqual(body.loaded as number)
  })

  it('rejects a non-admin caller with 403', async () => {
    const doctor = await login(USERS.doctor.username, USERS.doctor.password)
    const response = await request('/admin/agents/reload', {
      method: 'POST',
      token: doctor.token,
      body: {},
    })
    expect(response.status).toBe(403)
  })
})
