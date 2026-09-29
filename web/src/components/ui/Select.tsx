import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '@/components/ui/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string | null
  children: ReactNode
}

/** DESIGN_SYSTEM §5.2 — native select so keyboard and screen-reader behaviour stay standard. */
export function Select({ id, label, error, className, children, ...rest }: SelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-body-strong text-ink-700">
        {label}
      </label>
      <select
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'h-12 w-full rounded-md border bg-surface px-3 text-body text-ink-900 sm:h-11',
          error ? 'border-danger-600' : 'border-line',
          'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600',
          className,
        )}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-caption text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
