import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'

import { cn } from '@/components/ui/cn'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string | null
}

/** DESIGN_SYSTEM §5.2 — min height 96px, vertical resize. */
export function TextArea({ id, label, error, className, ...rest }: TextAreaProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-body-strong text-ink-700">
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-2 text-body text-ink-900 placeholder:text-ink-400',
          error ? 'border-danger-600' : 'border-line',
          'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600',
          className,
        )}
      />
      {error ? (
        <p id={errorId} className="text-caption text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
