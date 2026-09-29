import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import {
  adminListSessions,
  adminMetrics,
  downloadAdminExport,
  reloadAgents,
} from '@/api/endpoints'
import { EXPORT_TABLES, METRICS_GROUP_BY } from '@/api/types'
import type { ExportTable, MetricsGroupBy, MetricsRow } from '@/api/types'
import { MetricsTable } from '@/components/admin/MetricsTable'
import { TriageRatesChart } from '@/components/admin/TriageRatesChart'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { TriageBadge } from '@/components/session/TriageBadge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Toast } from '@/components/ui/Toast'
import {
  ADMIN_EXPORTS_TITLE,
  ADMIN_EXPORT,
  ADMIN_GROUP_BY_AGENT,
  ADMIN_GROUP_BY_ARCHITECTURE,
  ADMIN_GROUP_BY_MODEL,
  ADMIN_METRICS_EMPTY,
  ADMIN_RECENT_COL_USER,
  ADMIN_RECENT_EMPTY,
  ADMIN_RECENT_TITLE,
  ADMIN_RECENT_VIEW_ALL,
  ADMIN_RELOAD,
  ADMIN_SUMMARY_EVALUATED,
  ADMIN_SUMMARY_SAFETY_FLOOR,
  ADMIN_SUMMARY_SAFETY_FLAGS,
  ADMIN_SUMMARY_TOTAL_SESSIONS,
  ADMIN_TITLE,
  EXPORT_TABLE_LABELS,
  HISTORY_COL_DATE,
  HISTORY_COL_DOCTOR,
  HISTORY_COL_RESULT,
  NETWORK_ERROR,
  adminReloadToast,
} from '@/i18n/uiText'
import { faDateTime, faNumber } from '@/lib/format'

const GROUP_BY_LABELS: Record<MetricsGroupBy, string> = {
  agent: ADMIN_GROUP_BY_AGENT,
  architecture: ADMIN_GROUP_BY_ARCHITECTURE,
  model: ADMIN_GROUP_BY_MODEL,
}

/** Exact sums over the current rows — no averages are computed in the client. */
function summarize(rows: MetricsRow[]) {
  return rows.reduce(
    (totals, row) => ({
      sessions: totals.sessions + row.sessions_total,
      evaluated: totals.evaluated + row.sessions_evaluated,
      safetyFlags:
        totals.safetyFlags +
        Object.values(row.safety_flag_counts).reduce((sum, count) => sum + count, 0),
      safetyFloor: totals.safetyFloor + row.safety_floor_escalations,
    }),
    { sessions: 0, evaluated: 0, safetyFlags: 0, safetyFloor: 0 },
  )
}

/** UI_SPEC §3.5 — the comparison dashboard. */
export function AdminDashboardPage() {
  const [groupBy, setGroupBy] = useState<MetricsGroupBy>('agent')
  const [toast, setToast] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const metricsQuery = useQuery({
    queryKey: ['admin', 'metrics', groupBy],
    queryFn: () => adminMetrics(groupBy),
    placeholderData: keepPreviousData,
  })

  const recentQuery = useQuery({
    queryKey: ['admin', 'sessions', 'recent'],
    queryFn: () => adminListSessions({ limit: 5 }),
  })

  const reloadMutation = useMutation({
    mutationFn: reloadAgents,
    onSuccess: (result) => {
      setToast(adminReloadToast(faNumber(result.loaded), faNumber(result.enabled)))
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: () => {
      setToast(NETWORK_ERROR)
    },
  })

  const exportMutation = useMutation({
    mutationFn: (table: ExportTable) => downloadAdminExport(table),
    onError: () => {
      setToast(NETWORK_ERROR)
    },
  })

  if (metricsQuery.isPending) return <LoadingState rows={5} />
  if (metricsQuery.isError) return <ErrorState onRetry={() => void metricsQuery.refetch()} />

  const rows = metricsQuery.data?.rows ?? []
  const totals = summarize(rows)
  const recent = (recentQuery.data?.items ?? []).slice(0, 5)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-primary-900">{ADMIN_TITLE}</h1>
        <SegmentedControl
          label={ADMIN_TITLE}
          options={METRICS_GROUP_BY.map((value) => ({ value, label: GROUP_BY_LABELS[value] }))}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          testId="summary-total-sessions"
          label={ADMIN_SUMMARY_TOTAL_SESSIONS}
          value={faNumber(totals.sessions)}
        />
        <MetricCard
          testId="summary-evaluated"
          label={ADMIN_SUMMARY_EVALUATED}
          value={faNumber(totals.evaluated)}
        />
        <MetricCard
          testId="summary-safety-flags"
          label={ADMIN_SUMMARY_SAFETY_FLAGS}
          value={faNumber(totals.safetyFlags)}
        />
        <MetricCard
          testId="summary-safety-floor"
          label={ADMIN_SUMMARY_SAFETY_FLOOR}
          value={faNumber(totals.safetyFloor)}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState message={ADMIN_METRICS_EMPTY} />
      ) : (
        <>
          <TriageRatesChart rows={rows} />
          <MetricsTable rows={rows} />
        </>
      )}

      <Card data-testid="recent-sessions" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-h2 text-primary-900">{ADMIN_RECENT_TITLE}</h2>
          <Link to="/admin/sessions" className="text-body-strong text-primary-600 hover:underline">
            {ADMIN_RECENT_VIEW_ALL}
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="text-body text-ink-500">{ADMIN_RECENT_EMPTY}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-body">
              <thead>
                <tr className="bg-canvas">
                  <th className="border-b border-line px-3 py-2 text-start text-caption font-semibold text-ink-500">
                    {HISTORY_COL_DOCTOR}
                  </th>
                  <th className="border-b border-line px-3 py-2 text-start text-caption font-semibold text-ink-500">
                    {ADMIN_RECENT_COL_USER}
                  </th>
                  <th className="border-b border-line px-3 py-2 text-start text-caption font-semibold text-ink-500">
                    {HISTORY_COL_DATE}
                  </th>
                  <th className="border-b border-line px-3 py-2 text-start text-caption font-semibold text-ink-500">
                    {HISTORY_COL_RESULT}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((session) => (
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
                    data-testid="recent-session-row"
                  >
                    <td className="px-3 py-2">{session.agent.display_name}</td>
                    <td className="px-3 py-2 text-ink-500">{session.user.display_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-500">
                      {faDateTime(session.created_at, { dateOnly: true })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <TriageBadge level={session.final_triage_level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-h2 text-primary-900">{ADMIN_EXPORTS_TITLE}</h2>
        <div className="flex flex-wrap gap-2">
          {EXPORT_TABLES.map((table) => (
            <Button
              key={table}
              variant="secondary"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate(table)}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {ADMIN_EXPORT} — {EXPORT_TABLE_LABELS[table] ?? table}
            </Button>
          ))}
        </div>
      </Card>

      <div>
        <Button
          variant="secondary"
          disabled={reloadMutation.isPending}
          loading={reloadMutation.isPending}
          onClick={() => reloadMutation.mutate()}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {ADMIN_RELOAD}
        </Button>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </section>
  )
}
