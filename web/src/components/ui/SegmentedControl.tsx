import { cn } from '@/components/ui/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the group. */
  label: string
  /**
   * `group` = `role="group"` with `aria-pressed` buttons (group-by, winner);
   * `tabs` = `role="tablist"` with `role="tab"` buttons (history tabs).
   * `radios` = `role="radiogroup"` with `role="radio"` buttons.
   */
  mode?: 'group' | 'tabs' | 'radios'
  className?: string
}

/** DESIGN_SYSTEM §5.4/§6.7 — pill segmented control shared by tabs, group-by and winner. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  mode = 'group',
  className,
}: SegmentedControlProps<T>) {
  const containerRole = mode === 'tabs' ? 'tablist' : mode === 'radios' ? 'radiogroup' : 'group'

  return (
    <div
      role={containerRole}
      aria-label={label}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-pill bg-neutral-100 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role={mode === 'tabs' ? 'tab' : mode === 'radios' ? 'radio' : undefined}
            aria-selected={mode === 'tabs' ? active : undefined}
            aria-checked={mode === 'radios' ? active : undefined}
            aria-pressed={mode === 'group' ? active : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 rounded-pill px-3 text-body-strong transition-colors',
              active
                ? 'bg-surface text-primary-900 shadow-1'
                : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
