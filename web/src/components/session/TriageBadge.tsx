import clsx from 'clsx'

import type { TriageLevel } from '@/api/types'
import { triageLevelStyle } from '@/i18n/labels'

export interface TriageBadgeProps {
  level: TriageLevel | null | undefined
  size?: 'sm' | 'lg'
  className?: string
}

/** UI_SPEC §7.1 — a colored badge with the Persian triage label. */
export function TriageBadge({ level, size = 'sm', className }: TriageBadgeProps) {
  const style = triageLevelStyle(level)
  if (!style) {
    return (
      <span className="inline-block rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        —
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-block font-semibold',
        style.badgeClass,
        size === 'lg'
          ? 'rounded-lg border-2 px-4 py-2 text-base'
          : 'rounded-full border px-2 py-0.5 text-xs',
        className,
      )}
      data-testid="triage-badge"
      data-triage-level={level}
    >
      {style.label}
    </span>
  )
}
