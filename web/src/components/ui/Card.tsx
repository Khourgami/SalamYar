import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/components/ui/cn'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  children?: ReactNode
}

/** DESIGN_SYSTEM §5.3 — surface, 1px border, radius-lg, shadow-1, padding 20 (16 on mobile). */
export function Card({ title, children, className, ...rest }: CardProps) {
  return (
    <section
      {...rest}
      className={cn('rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5', className)}
    >
      {title ? <h2 className="mb-4 text-h2 text-primary-900">{title}</h2> : null}
      {children}
    </section>
  )
}
