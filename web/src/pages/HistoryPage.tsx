import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'

import { listSessions } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { TriageBadge } from '@/components/session/TriageBadge'
import { SESSION_STATUS_LABELS } from '@/i18n/labels'
import {
  HISTORY_COL_DATE,
  HISTORY_COL_DOCTOR,
  HISTORY_COL_EVALUATED,
  HISTORY_COL_FIRST_MESSAGE,
  HISTORY_EVALUATED_NO,
  HISTORY_EVALUATED_YES,
  HISTORY_EMPTY,
  HISTORY_COL_RESULT,
  HISTORY_COL_STATUS,
  HISTORY_NO_FIRST_MESSAGE,
  HISTORY_TAB_ALL,
  HISTORY_TAB_UNEVALUATED,
  HISTORY_TITLE,
} from '@/i18n/uiText'
import { faDateTime, truncate } from '@/lib/format'

type HistoryTab = 'all' | 'unevaluated'

const TABS: { key: HistoryTab; label: string }[] = [
  { key: 'all', label: HISTORY_TAB_ALL },
  { key: 'unevaluated', label: HISTORY_TAB_UNEVALUATED },
]

/** UI_SPEC §3.4 — the current user's sessions, with clickable rows. */
export function HistoryPage() {
  const [tab, setTab] = useState<HistoryTab>('all')
  const navigate = useNavigate()

  const sessionsQuery = useQuery({
    queryKey: ['sessions', { evaluated: tab === 'unevaluated' ? false : null }],
    queryFn: () => listSessions(tab === 'unevaluated' ? { evaluated: false } : {}),
    // keep the table on screen while the other tab loads
    placeholderData: keepPreviousData,
  })

  if (sessionsQuery.isPending) return <LoadingState rows={4} />
  if (sessionsQuery.isError) {
    return <ErrorState onRetry={() => void sessionsQuery.refetch()} />
  }

  const items = sessionsQuery.data?.items ?? []

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{HISTORY_TITLE}</h1>

      <div role="group" aria-label={HISTORY_TITLE} className="flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={clsx(
              'rounded border px-3 py-1.5 text-sm',
              tab === item.key
                ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState message={HISTORY_EMPTY} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="history-table">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_DOCTOR}
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_DATE}
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_FIRST_MESSAGE}
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_STATUS}
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_RESULT}
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-start font-medium">
                  {HISTORY_COL_EVALUATED}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((session) => (
                <tr
                  key={session.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => navigate(`/sessions/${session.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(`/sessions/${session.id}`)
                    }
                  }}
                  className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  data-testid="history-row"
                >
                  <td className="px-3 py-2">{session.agent.display_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {faDateTime(session.created_at, { dateOnly: true })}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-gray-600">
                    {session.first_patient_message
                      ? truncate(session.first_patient_message, 60)
                      : HISTORY_NO_FIRST_MESSAGE}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {SESSION_STATUS_LABELS[session.status]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <TriageBadge level={session.final_triage_level} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={clsx(
                        'rounded-full border px-2 py-0.5 text-xs',
                        session.evaluated
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-gray-100 text-gray-600',
                      )}
                    >
                      {session.evaluated ? HISTORY_EVALUATED_YES : HISTORY_EVALUATED_NO}
                    </span>
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
