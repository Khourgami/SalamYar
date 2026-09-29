import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/components/ui/cn'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  /** Set to `false` for cards whose children manage their own padding (e.g. the chat panel). */
  padded?: boolean
  children?: ReactNode
}

/** DESIGN_SYSTEM §5.3 — surface, 1px border, radius-lg, shadow-1, padding 20 (16 on mobile). */
export function Card({ title, padded = true, children, className, ...rest }: CardProps) {
  return (
    <section
      {...rest}
      className={cn(
        'rounded-lg border border-line bg-surface shadow-1',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {title ? <h2 className="mb-4 text-h2 text-primary-900">{title}</h2> : null}
      {children}
    </section>
  )
}
