import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { adminListSessions } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { TriageBadge } from '@/components/session/TriageBadge'
import { SESSION_STATUS_LABELS } from '@/i18n/labels'
import {
  ADMIN_FILTER_AGENT,
  ADMIN_FILTER_ALL,
  ADMIN_FILTER_EVALUATED,
  ADMIN_FILTER_NO,
  ADMIN_FILTER_USER,
  ADMIN_FILTER_YES,
  ADMIN_SESSIONS_COL_AGENT_ID,
  ADMIN_SESSIONS_COL_ARCHITECTURE,
  ADMIN_SESSIONS_COL_MODEL,
  ADMIN_SESSIONS_COL_USER,
  ADMIN_SESSIONS_TITLE,
  HISTORY_COL_DATE,
  HISTORY_COL_DOCTOR,
  HISTORY_COL_EVALUATED,
  HISTORY_COL_FIRST_MESSAGE,
  HISTORY_COL_RESULT,
  HISTORY_COL_STATUS,
  HISTORY_EMPTY,
  HISTORY_EVALUATED_NO,
  HISTORY_EVALUATED_YES,
  HISTORY_NO_FIRST_MESSAGE,
} from '@/i18n/uiText'
import { faDateTime, truncate } from '@/lib/format'

type EvaluatedFilter = '' | 'true' | 'false'

const selectClass =
  'rounded-md border border-line bg-surface px-2 py-1.5 text-body focus:border-primary-600 focus:outline-none'

/** UI_SPEC §3.6 — all sessions with agent / user / evaluated filters. */
export function AdminSessionsPage() {
  const [agentId, setAgentId] = useState('')
  const [userId, setUserId] = useState('')
  const [evaluated, setEvaluated] = useState<EvaluatedFilter>('')
  const navigate = useNavigate()

  const sessionsQuery = useQuery({
    queryKey: ['admin', 'sessions', { agentId, userId, evaluated }],
    queryFn: () =>
      adminListSessions({
        agent_id: agentId === '' ? undefined : agentId,
        user_id: userId === '' ? undefined : userId,
        evaluated: evaluated === '' ? undefined : evaluated === 'true',
        limit: 100,
      }),
    placeholderData: keepPreviousData,
  })

  // unfiltered list, only used to build the filter options
  const optionsQuery = useQuery({
    queryKey: ['admin', 'sessions', 'options'],
    queryFn: () => adminListSessions({ limit: 100 }),
  })

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of optionsQuery.data?.items ?? []) {
      seen.set(item.agent.id, item.agent.display_name)
    }
    return [...seen.entries()]
  }, [optionsQuery.data])

  const userOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of optionsQuery.data?.items ?? []) {
      seen.set(item.user.id, item.user.display_name)
    }
    return [...seen.entries()]
  }, [optionsQuery.data])

  if (sessionsQuery.isPending) return <LoadingState rows={5} />
  if (sessionsQuery.isError) {
    return <ErrorState onRetry={() => void sessionsQuery.refetch()} />
  }

  const items = sessionsQuery.data?.items ?? []

  return (
    <section className="space-y-4">
      <h1 className="text-h1 text-primary-900">{ADMIN_SESSIONS_TITLE}</h1>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-body text-ink-700">
          {ADMIN_FILTER_AGENT}
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            className={selectClass}
          >
            <option value="">{ADMIN_FILTER_ALL}</option>
            {agentOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-body text-ink-700">
          {ADMIN_FILTER_USER}
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className={selectClass}
          >
            <option value="">{ADMIN_FILTER_ALL}</option>
            {userOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-body text-ink-700">
          {ADMIN_FILTER_EVALUATED}
          <select
            value={evaluated}
            onChange={(event) => setEvaluated(event.target.value as EvaluatedFilter)}
            className={selectClass}
          >
            <option value="">{ADMIN_FILTER_ALL}</option>
            <option value="true">{ADMIN_FILTER_YES}</option>
            <option value="false">{ADMIN_FILTER_NO}</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState message={HISTORY_EMPTY} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table
            className="w-full min-w-[64rem] border-collapse text-body"
            data-testid="admin-sessions-table"
          >
            <thead>
              <tr className="bg-canvas">
                {[
                  HISTORY_COL_DOCTOR,
                  ADMIN_SESSIONS_COL_USER,
                  HISTORY_COL_DATE,
                  HISTORY_COL_FIRST_MESSAGE,
                  HISTORY_COL_STATUS,
                  HISTORY_COL_RESULT,
                  HISTORY_COL_EVALUATED,
                  ADMIN_SESSIONS_COL_AGENT_ID,
                  ADMIN_SESSIONS_COL_MODEL,
                  ADMIN_SESSIONS_COL_ARCHITECTURE,
                ].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="border-b border-line px-3 py-2 text-start text-caption font-semibold whitespace-nowrap text-ink-500"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((session) => (
                <tr
                  key={session.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => navigate(`/admin/sessions/${session.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(`/admin/sessions/${session.id}`)
                    }
                  }}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-primary-100 focus:bg-primary-100 focus:outline-none"
                  data-testid="admin-session-row"
                >
                  <td className="px-3 py-2">{session.agent.display_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{session.user.display_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-500">
                    {faDateTime(session.created_at, { dateOnly: true })}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-ink-500">
                    {session.first_patient_message
                      ? truncate(session.first_patient_message, 60)
                      : HISTORY_NO_FIRST_MESSAGE}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-700">
                    {SESSION_STATUS_LABELS[session.status]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <TriageBadge level={session.final_triage_level} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {session.evaluated ? HISTORY_EVALUATED_YES : HISTORY_EVALUATED_NO}
                  </td>
                  <td className="ltr px-3 py-2 whitespace-nowrap text-ink-500">
                    {session.agent.id}
                  </td>
                  <td className="ltr px-3 py-2 whitespace-nowrap text-ink-500">
                    {session.agent_reveal.model}
                  </td>
                  <td className="ltr px-3 py-2 whitespace-nowrap text-ink-500">
                    {session.agent_reveal.architecture}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
