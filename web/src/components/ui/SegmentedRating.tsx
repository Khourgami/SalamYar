import { useId } from 'react'
import type { KeyboardEvent } from 'react'

import { cn } from '@/components/ui/cn'
import { faNumber } from '@/lib/format'

export interface SegmentedRatingProps {
  /** The KPI label (the fieldset legend). */
  label: string
  /** Native radio group name; must be unique per KPI. */
  name: string
  value: number | null
  onChange: (value: number) => void
  /** Anchor texts shown under boxes 1, 3 and 5. */
  anchors?: Partial<Record<number, string>>
  min?: number
  max?: number
  error?: string | null
  /** Anchor for the first-invalid-field scroll (`W-021`). */
  id?: string
}

/** DESIGN_SYSTEM §5.10 — native radios, two-digit boxes, anchors under 1/3/5, no stars. */
export function SegmentedRating({
  label,
  name,
  value,
  onChange,
  anchors,
  min = 1,
  max = 5,
  error,
  id,
}: SegmentedRatingProps) {
  const generatedId = useId()
  const legendId = `${id ?? generatedId}-legend`
  const values = Array.from({ length: max - min + 1 }, (_unused, index) => min + index)
  const anchorValues = values.filter((item) => item === 1 || item === 3 || item === 5)

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0
    if (delta === 0) return
    event.preventDefault()
    const current = value ?? min
    const next = Math.min(max, Math.max(min, current + delta))
    onChange(next)
    document.getElementById(`${name}-${next}`)?.focus()
  }

  return (
    <div id={id} className="flex flex-col gap-2">
      <fieldset
        aria-invalid={error ? true : undefined}
        aria-labelledby={legendId}
        className={cn(
          'rounded-md border p-3',
          error ? 'border-danger-600' : 'border-line',
        )}
      >
        <legend id={legendId} className="px-1 text-body-strong text-ink-700">
          {label}
        </legend>

        <div className="flex flex-wrap items-center gap-2">
          {values.map((item) => (
            <label key={item} className="inline-flex">
              <input
                id={`${name}-${item}`}
                type="radio"
                name={name}
                value={item}
                checked={value === item}
                onChange={() => onChange(item)}
                onKeyDown={onKeyDown}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-md border bg-surface text-body-strong text-ink-700 sm:h-10 sm:w-10',
                  'hover:bg-primary-100',
                  'peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600 peer-focus-visible:ring-offset-2',
                )}
              >
                {faNumber(item)}
              </span>
            </label>
          ))}
        </div>

        {anchors ? (
          <div className="mt-2 flex justify-between gap-2 text-caption text-ink-500">
            {anchorValues.map((item) => (
              <span key={item} className="flex-1">
                {anchors[item]}
              </span>
            ))}
          </div>
        ) : null}
      </fieldset>
      {error ? (
        <p className="text-caption text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
