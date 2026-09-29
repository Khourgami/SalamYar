import { useEffect } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/components/ui/cn'
import { CHAT_FEEDBACK_CANCEL } from '@/i18n/uiText'

export type ToastTone = 'info' | 'error'

export interface ToastProps {
  message: string | null
  onDismiss: () => void
  /** Auto-dismiss delay in ms. */
  durationMs?: number
  tone?: ToastTone
}

/** DESIGN_SYSTEM §5.7 — bottom-center on mobile, bottom inline-end on desktop. */
export function Toast({ message, onDismiss, durationMs = 5_000, tone = 'info' }: ToastProps) {
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
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      className={cn(
        'fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md px-4 py-3 text-body shadow-2 sm:inset-x-auto sm:end-6 sm:mx-0',
        tone === 'error' ? 'bg-danger-700 text-white' : 'bg-primary-900 text-white',
      )}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={CHAT_FEEDBACK_CANCEL}
        className="rounded p-1 text-white/70 hover:bg-white/10"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
