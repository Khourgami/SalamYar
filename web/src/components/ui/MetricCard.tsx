import type { ReactNode } from 'react'

import { Card } from '@/components/ui/Card'

/** DESIGN_SYSTEM §5.12 — label (caption) on top, value (h1, tabular) below. No delta or trend. */
export function MetricCard({
  label,
  value,
  testId,
}: {
  label: string
  value: ReactNode
  testId?: string
}) {
  return (
    <Card className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-caption text-ink-500">{label}</span>
      <span className="text-h1 tabular-nums text-primary-900">{value}</span>
    </Card>
  )
}
