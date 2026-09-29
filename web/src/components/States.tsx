import { Loader2 } from 'lucide-react'

import { NETWORK_ERROR, TRY_AGAIN } from '@/i18n/uiText'

/** UI_SPEC §4 — loading pages show skeletons. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

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
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      role="alert"
      data-testid="error-state"
    >
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-red-300 bg-white px-3 py-1 font-medium text-red-700 hover:bg-red-100"
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
      className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500"
      data-testid="empty-state"
    >
      {message}
    </div>
  )
}

export function InlineSpinner({ className = '' }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={`h-4 w-4 animate-spin ${className}`} />
}
