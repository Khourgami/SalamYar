import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import type { MetricsRow } from '@/api/types'
import { KPI_KEYS, KPI_LABELS, SAFETY_FLAG_KEYS_ORDER } from '@/i18n/labels'
import {
  ADMIN_COL_ARCHITECTURE,
  ADMIN_COL_FEEDBACK,
  ADMIN_COL_INSUFFICIENT_INFO,
  ADMIN_COL_LABEL,
  ADMIN_COL_LATENCY_P50,
  ADMIN_COL_LATENCY_P90,
  ADMIN_COL_LOSSES,
  ADMIN_COL_MEAN_COMPLETION_TOKENS,
  ADMIN_COL_MEAN_COST,
  ADMIN_COL_MEAN_LLM_CALLS,
  ADMIN_COL_MEAN_PROMPT_TOKENS,
  ADMIN_COL_MEAN_QUESTIONS,
  ADMIN_COL_MEAN_REASONING_TOKENS,
  ADMIN_COL_MODEL,
  ADMIN_COL_OVERTRIAGE,
  ADMIN_COL_SAFETY_FLOOR,
  ADMIN_COL_SAFETY_FLAGS,
  ADMIN_COL_SESSIONS,
  ADMIN_COL_SPECIALTY_MATCH,
  ADMIN_COL_TIES,
  ADMIN_COL_TOTAL_COST,
  ADMIN_COL_TRIAGE_EXACT,
  ADMIN_COL_UNDERTRIAGE,
  ADMIN_COL_UNDERTRIAGE_EMERGENCY,
  ADMIN_COL_WINS,
} from '@/i18n/uiText'
import { faDecimal, faLatency, faNumber, faPercent, usd } from '@/lib/format'

interface MetricColumn {
  key: string
  label: string
  /** Value used for sorting; `null`/`undefined` sorts last. */
  sortValue: (row: MetricsRow) => number | string | null
  render: (row: MetricsRow) => ReactNode
  /** Highlight in red when this returns true (under-triage > 0). */
  danger?: (row: MetricsRow) => boolean
}

const DASH = <span className="text-ink-500">—</span>

function totalSafetyFlags(row: MetricsRow): number {
  return SAFETY_FLAG_KEYS_ORDER.reduce((total, key) => total + row.safety_flag_counts[key], 0)
}

export const METRIC_COLUMNS: MetricColumn[] = [
  {
    key: 'label',
    label: ADMIN_COL_LABEL,
    sortValue: (row) => row.label,
    render: (row) => <span className="text-body-strong text-ink-900">{row.label}</span>,
  },
  {
    key: 'architecture',
    label: ADMIN_COL_ARCHITECTURE,
    sortValue: (row) => row.architecture,
    render: (row) => (row.architecture ? <span className="ltr">{row.architecture}</span> : DASH),
  },
  {
    key: 'model',
    label: ADMIN_COL_MODEL,
    sortValue: (row) => row.model,
    render: (row) => (row.model ? <span className="ltr">{row.model}</span> : DASH),
  },
  {
    key: 'sessions',
    label: ADMIN_COL_SESSIONS,
    sortValue: (row) => row.sessions_total,
    render: (row) => (
      <span className="whitespace-nowrap">
        {faNumber(row.sessions_evaluated)}/{faNumber(row.sessions_total)}
      </span>
    ),
  },
  {
    key: 'undertriage',
    label: ADMIN_COL_UNDERTRIAGE,
    sortValue: (row) => row.undertriage_rate,
    render: (row) => (
      <span className={clsx((row.undertriage_rate ?? 0) > 0 && 'font-semibold text-danger-700')}>
        {faPercent(row.undertriage_rate)}
      </span>
    ),
    danger: (row) => (row.undertriage_rate ?? 0) > 0,
  },
  {
    key: 'undertriage_emergency',
    label: ADMIN_COL_UNDERTRIAGE_EMERGENCY,
    sortValue: (row) => row.undertriage_emergency_rate,
    render: (row) => faPercent(row.undertriage_emergency_rate),
  },
  {
    key: 'overtriage',
    label: ADMIN_COL_OVERTRIAGE,
    sortValue: (row) => row.overtriage_rate,
    render: (row) => faPercent(row.overtriage_rate),
  },
  {
    key: 'triage_exact',
    label: ADMIN_COL_TRIAGE_EXACT,
    sortValue: (row) => row.triage_exact_rate,
    render: (row) => faPercent(row.triage_exact_rate),
  },
  {
    key: 'specialty_match',
    label: ADMIN_COL_SPECIALTY_MATCH,
    sortValue: (row) => row.specialty_match_rate,
    render: (row) => faPercent(row.specialty_match_rate),
  },
  {
    key: 'insufficient_info',
    label: ADMIN_COL_INSUFFICIENT_INFO,
    sortValue: (row) => row.insufficient_info_count,
    render: (row) => faNumber(row.insufficient_info_count),
  },
  ...KPI_KEYS.map<MetricColumn>((key) => ({
    key: `kpi_${key}`,
    label: KPI_LABELS[key].label,
    sortValue: (row) => row.mean_scores[key],
    render: (row) => faDecimal(row.mean_scores[key], 1),
  })),
  {
    key: 'safety_flags',
    label: ADMIN_COL_SAFETY_FLAGS,
    sortValue: totalSafetyFlags,
    render: (row) => faNumber(totalSafetyFlags(row)),
  },
  {
    key: 'mean_questions',
    label: ADMIN_COL_MEAN_QUESTIONS,
    sortValue: (row) => row.mean_questions,
    render: (row) => faDecimal(row.mean_questions, 1),
  },
  {
    key: 'latency_p50',
    label: ADMIN_COL_LATENCY_P50,
    sortValue: (row) => row.turn_latency_p50_ms,
    render: (row) => faLatency(row.turn_latency_p50_ms),
  },
  {
    key: 'latency_p90',
    label: ADMIN_COL_LATENCY_P90,
    sortValue: (row) => row.turn_latency_p90_ms,
    render: (row) => faLatency(row.turn_latency_p90_ms),
  },
  {
    key: 'mean_cost',
    label: ADMIN_COL_MEAN_COST,
    sortValue: (row) => row.mean_cost_usd,
    render: (row) => usd(row.mean_cost_usd),
  },
  {
    key: 'total_cost',
    label: ADMIN_COL_TOTAL_COST,
    sortValue: (row) => row.total_cost_usd,
    render: (row) => usd(row.total_cost_usd),
  },
  {
    key: 'mean_llm_calls',
    label: ADMIN_COL_MEAN_LLM_CALLS,
    sortValue: (row) => row.mean_llm_calls,
    render: (row) => faDecimal(row.mean_llm_calls, 1),
  },
  {
    key: 'mean_prompt_tokens',
    label: ADMIN_COL_MEAN_PROMPT_TOKENS,
    sortValue: (row) => row.mean_prompt_tokens,
    render: (row) => faDecimal(row.mean_prompt_tokens, 1),
  },
  {
    key: 'mean_completion_tokens',
    label: ADMIN_COL_MEAN_COMPLETION_TOKENS,
    sortValue: (row) => row.mean_completion_tokens,
    render: (row) => faDecimal(row.mean_completion_tokens, 1),
  },
  {
    key: 'mean_reasoning_tokens',
    label: ADMIN_COL_MEAN_REASONING_TOKENS,
    sortValue: (row) => row.mean_reasoning_tokens,
    render: (row) => faDecimal(row.mean_reasoning_tokens, 1),
  },
  {
    key: 'feedback',
    label: ADMIN_COL_FEEDBACK,
    sortValue: (row) => row.feedback_up - row.feedback_down,
    render: (row) => (
      <span className="whitespace-nowrap">
        {faNumber(row.feedback_up)}/{faNumber(row.feedback_down)}
      </span>
    ),
  },
  {
    key: 'wins',
    label: ADMIN_COL_WINS,
    sortValue: (row) => row.pairwise.wins,
    render: (row) => faNumber(row.pairwise.wins),
  },
  {
    key: 'losses',
    label: ADMIN_COL_LOSSES,
    sortValue: (row) => row.pairwise.losses,
    render: (row) => faNumber(row.pairwise.losses),
  },
  {
    key: 'ties',
    label: ADMIN_COL_TIES,
    sortValue: (row) => row.pairwise.ties,
    render: (row) => faNumber(row.pairwise.ties),
  },
  {
    key: 'safety_floor',
    label: ADMIN_COL_SAFETY_FLOOR,
    sortValue: (row) => row.safety_floor_escalations,
    render: (row) => faNumber(row.safety_floor_escalations),
  },
]

type SortDirection = 'asc' | 'desc'

/** UI_SPEC §3.5 — one row per `MetricsRow`, sortable on every column. */
export function MetricsTable({ rows }: { rows: MetricsRow[] }) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = METRIC_COLUMNS.find((candidate) => candidate.key === sort.key)
    if (!column) return rows

    const direction = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = column.sortValue(a)
      const right = column.sortValue(b)
      if (left === null || left === undefined) return 1
      if (right === null || right === undefined) return -1
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
      return String(left).localeCompare(String(right), 'fa') * direction
    })
  }, [rows, sort])

  function toggleSort(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' }
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-body" data-testid="metrics-table">
        <thead>
          <tr className="bg-canvas">
            {METRIC_COLUMNS.map((column) => {
              const active = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className="border-b border-line px-2 py-2 text-start align-bottom text-caption font-semibold whitespace-nowrap text-ink-500"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-ink-900"
                  >
                    {column.label}
                    {active ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5 text-ink-400" />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-0" data-testid="metrics-row">
              {METRIC_COLUMNS.map((column) => (
                <td key={column.key} className="px-2 py-2 whitespace-nowrap text-ink-700 tabular-nums">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
