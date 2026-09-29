import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

import { cn } from '@/components/ui/cn'

export type AlertTone = 'danger' | 'warning' | 'info' | 'success'

const TONES: Record<AlertTone, { wrap: string; icon: string; Icon: typeof Info }> = {
  danger: { wrap: 'bg-danger-100 border-danger-600', icon: 'text-danger-600', Icon: CircleAlert },
  warning: {
    wrap: 'bg-warning-100 border-warning-600',
    icon: 'text-warning-600',
    Icon: TriangleAlert,
  },
  info: { wrap: 'bg-info-100 border-info-600', icon: 'text-info-600', Icon: Info },
  success: {
    wrap: 'bg-success-100 border-success-600',
    icon: 'text-success-600',
    Icon: CircleCheck,
  },
}

/** DESIGN_SYSTEM §5.5 — soft background, 4px inline-start border in the tone's `-600`. */
export function Alert({
  tone = 'info',
  title,
  children,
  role,
  className,
  testId,
}: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  role?: 'alert' | 'status' | 'note'
  className?: string
  testId?: string
}) {
  const { wrap, icon, Icon } = TONES[tone]
  return (
    <div
      role={role}
      data-testid={testId}
      className={cn('flex items-start gap-2 rounded-md border-s-4 p-3', wrap, className)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} />
      <div className="flex-1">
        {title ? <p className="text-body-strong text-ink-900">{title}</p> : null}
        {children ? <div className="text-body text-ink-700">{children}</div> : null}
      </div>
    </div>
  )
}
