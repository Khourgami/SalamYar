import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MetricsRow } from '@/api/types'
import { Card } from '@/components/ui/Card'
import {
  ADMIN_CHART_ARIA,
  ADMIN_CHART_CAPTION,
  ADMIN_CHART_SERIES_SPECIALTY,
  ADMIN_CHART_SERIES_TRIAGE,
  ADMIN_CHART_SERIES_UNDERTRIAGE,
  ADMIN_CHART_TITLE,
} from '@/i18n/uiText'
import { faPercentValue } from '@/lib/format'

/** A 0..1 rate as a 0..100 percentage with one decimal; `null` stays `null` (no bar). */
function toPercent(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 1_000) / 10
}

/**
 * DESIGN_SYSTEM §5.13 — a grouped bar chart with the three rate series. The SVG is wrapped in
 * `dir="ltr"` so the axes render correctly while all texts stay Persian.
 */
export function TriageRatesChart({ rows }: { rows: MetricsRow[] }) {
  const data = rows.map((row) => ({
    label: row.label,
    triage: toPercent(row.triage_exact_rate),
    undertriage: toPercent(row.undertriage_rate),
    specialty: toPercent(row.specialty_match_rate),
  }))

  return (
    <Card data-testid="triage-chart" className="flex flex-col gap-2">
      <h2 className="text-h2 text-primary-900">{ADMIN_CHART_TITLE}</h2>

      <div dir="ltr" role="img" aria-label={ADMIN_CHART_ARIA} className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value: number) => faPercentValue(value)} width={56} />
            <Tooltip formatter={(value: number) => faPercentValue(value)} />
            <Legend />
            <Bar dataKey="triage" name={ADMIN_CHART_SERIES_TRIAGE} fill="var(--color-primary-600)" />
            <Bar
              dataKey="undertriage"
              name={ADMIN_CHART_SERIES_UNDERTRIAGE}
              fill="var(--color-accent-500)"
            />
            <Bar
              dataKey="specialty"
              name={ADMIN_CHART_SERIES_SPECIALTY}
              fill="var(--color-primary-900)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-caption text-ink-500">{ADMIN_CHART_CAPTION}</p>
    </Card>
  )
}
