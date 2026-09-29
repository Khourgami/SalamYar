import { CalendarClock, Clock, HelpCircle, Home, Siren } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { TriageLevel } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { cn } from '@/components/ui/cn'
import { TRIAGE_LEVEL_LABELS, triageLevelStyle } from '@/i18n/labels'

const TONES: Record<TriageLevel, BadgeTone> = {
  EMERGENCY_NOW: 'danger',
  URGENT_24H: 'warning',
  ROUTINE_DAYS: 'primary',
  SELF_CARE: 'success',
  INSUFFICIENT_INFO: 'neutral',
}

const ICONS: Record<TriageLevel, LucideIcon> = {
  EMERGENCY_NOW: Siren,
  URGENT_24H: Clock,
  ROUTINE_DAYS: CalendarClock,
  SELF_CARE: Home,
  INSUFFICIENT_INFO: HelpCircle,
}

export interface TriageBadgeProps {
  level: TriageLevel | null | undefined
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * DESIGN_SYSTEM §5.4 — `lg` is 36px tall with an icon (result card); `sm` has no icon (tables).
 * Colors per §1.2; the emergency state always carries an icon so colour is never the only signal.
 */
export function TriageBadge({ level, size = 'sm', className }: TriageBadgeProps) {
  const style = triageLevelStyle(level)
  if (!level || !style) {
    return (
      <span className="inline-block rounded-pill border border-ink-400 bg-neutral-100 px-2.5 py-0.5 text-caption text-neutral-700">
        —
      </span>
    )
  }

  const Icon = ICONS[level]

  return (
    <span
      data-testid="triage-badge"
      data-triage-level={level}
      className={cn('inline-block', className)}
    >
      <Badge
        tone={TONES[level]}
        size={size}
        icon={size === 'lg' ? <Icon aria-hidden="true" className="h-4 w-4" /> : undefined}
      >
        {TRIAGE_LEVEL_LABELS[level].label}
      </Badge>
    </span>
  )
}
