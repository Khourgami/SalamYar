import type { ReactNode } from 'react'

import { cn } from '@/components/ui/cn'

export type BadgeTone = 'danger' | 'warning' | 'primary' | 'success' | 'neutral' | 'info'

const TONES: Record<BadgeTone, string> = {
  danger: 'bg-danger-100 text-danger-700 border-danger-600',
  warning: 'bg-warning-100 text-warning-700 border-warning-600',
  primary: 'bg-primary-100 text-primary-700 border-primary-600',
  success: 'bg-success-100 text-success-700 border-success-600',
  neutral: 'bg-neutral-100 text-neutral-700 border-ink-400',
  info: 'bg-info-100 text-primary-700 border-info-600',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** `lg` is 36px tall with an icon (result card); `sm` has no icon (tables). */
  size?: 'sm' | 'lg'
  icon?: ReactNode
  className?: string
  children: ReactNode
}

/** DESIGN_SYSTEM §5.4 — pill, `sm` (tables) or `lg` (result card, with icon). */
export function Badge({ tone = 'neutral', size = 'sm', icon, className, children }: BadgeProps) {
  return (
    <span
      data-testid="badge"
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border',
        size === 'lg' ? 'h-9 px-3 text-body-strong' : 'px-2.5 py-0.5 text-caption',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
