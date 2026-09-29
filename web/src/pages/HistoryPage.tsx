import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { listSessions } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { TriageBadge } from '@/components/session/TriageBadge'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SESSION_STATUS_LABELS } from '@/i18n/labels'
import {
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
  HISTORY_TAB_ALL,
  HISTORY_TAB_UNEVALUATED,
  HISTORY_TITLE,
} from '@/i18n/uiText'
import { faDateTime, truncate } from '@/lib/format'

type HistoryTab = 'all' | 'unevaluated'

const TABS: { value: HistoryTab; label: string }[] = [
  { value: 'all', label: HISTORY_TAB_ALL },
  { value: 'unevaluated', label: HISTORY_TAB_UNEVALUATED },
]

const TH = 'border-b border-line px-3 py-2 text-start text-caption font-semibold text-ink-500'

/** UI_SPEC §3.4 / DESIGN_SYSTEM §6.7 — the current user's sessions, with clickable rows. */
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
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 text-primary-900">{HISTORY_TITLE}</h1>

      <SegmentedControl label={HISTORY_TITLE} mode="tabs" options={TABS} value={tab} onChange={setTab} />

      {items.length === 0 ? (
        <EmptyState message={HISTORY_EMPTY} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[44rem] border-collapse text-body" data-testid="history-table">
            <thead>
              <tr className="bg-canvas">
                <th className={TH}>{HISTORY_COL_DOCTOR}</th>
                <th className={TH}>{HISTORY_COL_DATE}</th>
                <th className={TH}>{HISTORY_COL_FIRST_MESSAGE}</th>
                <th className={TH}>{HISTORY_COL_STATUS}</th>
                <th className={TH}>{HISTORY_COL_RESULT}</th>
                <th className={TH}>{HISTORY_COL_EVALUATED}</th>
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
                  className="min-h-12 cursor-pointer border-b border-line last:border-0 hover:bg-primary-100 focus:bg-primary-100 focus:outline-none"
                  data-testid="history-row"
                >
                  <td className="px-3 py-2">{session.agent.display_name}</td>
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
                    <Badge tone={session.evaluated ? 'success' : 'neutral'}>
                      {session.evaluated ? HISTORY_EVALUATED_YES : HISTORY_EVALUATED_NO}
                    </Badge>
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
