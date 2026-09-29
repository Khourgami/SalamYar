import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Download, RefreshCw } from 'lucide-react'

import { adminMetrics, downloadAdminExport, reloadAgents } from '@/api/endpoints'
import { EXPORT_TABLES, METRICS_GROUP_BY } from '@/api/types'
import type { ExportTable, MetricsGroupBy } from '@/api/types'
import { MetricsTable } from '@/components/admin/MetricsTable'
import { EmptyState, ErrorState, InlineSpinner, LoadingState } from '@/components/States'
import { Toast } from '@/components/ui/Toast'
import {
  ADMIN_EXPORTS_TITLE,
  ADMIN_EXPORT,
  ADMIN_GROUP_BY_AGENT,
  ADMIN_GROUP_BY_ARCHITECTURE,
  ADMIN_GROUP_BY_MODEL,
  ADMIN_METRICS_EMPTY,
  ADMIN_RELOAD,
  ADMIN_TITLE,
  EXPORT_TABLE_LABELS,
  NETWORK_ERROR,
  adminReloadToast,
} from '@/i18n/uiText'
import { faNumber } from '@/lib/format'

const GROUP_BY_LABELS: Record<MetricsGroupBy, string> = {
  agent: ADMIN_GROUP_BY_AGENT,
  architecture: ADMIN_GROUP_BY_ARCHITECTURE,
  model: ADMIN_GROUP_BY_MODEL,
}

/** UI_SPEC §3.5 — the comparison dashboard. */
export function AdminDashboardPage() {
  const [groupBy, setGroupBy] = useState<MetricsGroupBy>('agent')
  const [toast, setToast] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const metricsQuery = useQuery({
    queryKey: ['admin', 'metrics', groupBy],
    queryFn: () => adminMetrics(groupBy),
    placeholderData: keepPreviousData,
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

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">{ADMIN_TITLE}</h1>

        <div role="group" aria-label={ADMIN_TITLE} className="flex flex-wrap gap-2">
          {METRICS_GROUP_BY.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={groupBy === option}
              onClick={() => setGroupBy(option)}
              className={clsx(
                'rounded border px-3 py-1.5 text-sm',
                groupBy === option
                  ? 'border-teal-700 bg-teal-50 font-semibold text-teal-800'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {GROUP_BY_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState message={ADMIN_METRICS_EMPTY} />
      ) : (
        <MetricsTable rows={rows} />
      )}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">{ADMIN_EXPORTS_TITLE}</h2>
        <div className="flex flex-wrap gap-2">
          {EXPORT_TABLES.map((table) => (
            <button
              key={table}
              type="button"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate(table)}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              {ADMIN_EXPORT} — {EXPORT_TABLE_LABELS[table] ?? table}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={reloadMutation.isPending}
        onClick={() => reloadMutation.mutate()}
        className="inline-flex items-center gap-2 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-gray-300"
      >
        {reloadMutation.isPending ? (
          <InlineSpinner />
        ) : (
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        )}
        {ADMIN_RELOAD}
      </button>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </section>
  )
}
