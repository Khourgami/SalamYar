import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface ToastProps {
  message: string | null
  onDismiss: () => void
  /** Auto-dismiss delay in ms. */
  durationMs?: number
}

/** Transient message (409 `TURN_IN_PROGRESS`, network failures, reload result). */
export function Toast({ message, onDismiss, durationMs = 5_000 }: ToastProps) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDismiss, durationMs)
    return () => {
      clearTimeout(timer)
    }
  }, [message, onDismiss, durationMs])

  if (!message) return null

  return (
    <div
      role="status"
      data-testid="toast"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="بستن"
        className="rounded p-1 text-gray-300 hover:bg-white/10"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
