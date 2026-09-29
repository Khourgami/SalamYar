import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { controlClasses } from '@/components/ui/TextField'
import { cn } from '@/components/ui/cn'
import { PASSWORD_HIDE, PASSWORD_SHOW } from '@/i18n/uiText'

export interface PasswordFieldProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  autoComplete?: string
  autoFocus?: boolean
}

/** DESIGN_SYSTEM §5.2 — the show/hide toggle is the only extra affordance allowed on login. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete = 'current-password',
  autoFocus,
}: PasswordFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-body-strong text-ink-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(controlClasses(Boolean(error)), 'pe-11')}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? PASSWORD_HIDE : PASSWORD_SHOW}
          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-ink-400 hover:text-ink-700"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Eye aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-caption text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
