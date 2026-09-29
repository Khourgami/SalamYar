import { useId } from 'react'
import type { ReactNode } from 'react'

import { CANCEL, CONFIRM } from '@/i18n/uiText'

export interface ConfirmDialogProps {
  open: boolean
  message: string
  confirmLabel?: string
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  message,
  confirmLabel = CONFIRM,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="confirm-dialog"
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <p id={titleId} className="text-sm text-gray-800">
          {message}
        </p>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {CANCEL}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
