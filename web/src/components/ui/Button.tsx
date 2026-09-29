import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/components/ui/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:[filter:brightness(.92)] active:[filter:brightness(.86)]',
  secondary: 'border border-line bg-surface text-primary-900 hover:bg-primary-100',
  ghost: 'text-primary-600 hover:bg-primary-100',
  danger: 'bg-danger-700 text-white hover:[filter:brightness(.92)] active:[filter:brightness(.86)]',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-10 px-4',
  lg: 'h-12 px-4',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** `lg` is the 48px main CTA used on mobile (`ورود`, `ارسال`, `ثبت ارزیابی`). */
  size?: ButtonSize
  /** Shows a spinner at the inline-start, keeps the label, sets `aria-busy`, ignores clicks. */
  loading?: boolean
  fullWidth?: boolean
  children?: ReactNode
}

/** DESIGN_SYSTEM §5.1 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md text-button transition-colors',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        isDisabled &&
          'cursor-not-allowed border-transparent bg-disabled-bg text-disabled-text hover:[filter:none]',
        className,
      )}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  )
}
