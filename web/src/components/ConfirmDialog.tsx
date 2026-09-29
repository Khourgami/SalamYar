import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CANCEL, CONFIRM } from '@/i18n/uiText'

export interface ConfirmDialogProps {
  open: boolean
  message: string
  confirmLabel?: string
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

/** DESIGN_SYSTEM §5.6 — the confirm dialog is the Modal primitive with a primary/secondary pair. */
export function ConfirmDialog({
  open,
  message,
  confirmLabel = CONFIRM,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={message}
      onClose={onCancel}
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {CANCEL}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
