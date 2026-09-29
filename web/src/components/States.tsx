import { Loader2 } from 'lucide-react'

import { Skeleton } from '@/components/ui/Skeleton'
import { NETWORK_ERROR, TRY_AGAIN } from '@/i18n/uiText'

export { Skeleton }

/** UI_SPEC §4 — loading pages show skeletons. */
export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" data-testid="loading-state">
      {Array.from({ length: rows }, (_value, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  )
}

export function ErrorState({
  message = NETWORK_ERROR,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div
      className="rounded-lg border border-danger-600 bg-danger-100 p-4 text-body text-danger-700"
      role="alert"
      data-testid="error-state"
    >
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-danger-600 bg-surface px-3 py-1 text-body-strong text-danger-700 hover:bg-danger-100"
        >
          {TRY_AGAIN}
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border border-dashed border-line bg-surface p-6 text-center text-body text-ink-500"
      data-testid="empty-state"
    >
      {message}
    </div>
  )
}

export function InlineSpinner({ className = '' }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={`h-4 w-4 animate-spin ${className}`} />
}
