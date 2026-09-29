import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'

import { cn } from '@/components/ui/cn'

/** DESIGN_SYSTEM §5.2 — 44px tall (48 on mobile), label above, never placeholder-as-label. */
export function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    'w-full rounded-md border bg-surface px-3 text-body text-ink-900 placeholder:text-ink-400',
    'h-12 sm:h-11',
    hasError ? 'border-danger-600' : 'border-line',
    'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600',
    'disabled:bg-disabled-bg disabled:text-disabled-text',
    className,
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Renders the danger helper and sets `aria-invalid` + `aria-describedby`. */
  error?: string | null
  helperText?: string
}

/** DESIGN_SYSTEM §5.2 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, error, helperText, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const helperId = `${fieldId}-helper`
  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-body-strong text-ink-700">
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={controlClasses(Boolean(error), className)}
      />
      {error ? (
        <p id={errorId} className="text-caption text-danger-700">
          {error}
        </p>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-caption text-ink-500">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})
