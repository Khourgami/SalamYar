import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/components/ui/cn'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  open: boolean
  title: ReactNode
  children?: ReactNode
  /** Rendered at the bottom, inline-end aligned (confirm + cancel). */
  footer?: ReactNode
  onClose: () => void
  className?: string
  /** Test hook; defaults to `modal`. `ConfirmDialog` keeps `confirm-dialog` for phase 1. */
  testId?: string
}

/**
 * DESIGN_SYSTEM §5.6 — `role="dialog"`, `aria-modal`, focus trap, Escape closes and focus
 * returns to the element that opened it.
 */
export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  className,
  testId = 'modal',
}: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const firstNode = focusable[0]
      const lastNode = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault()
        lastNode?.focus()
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault()
        firstNode?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={cn('w-full max-w-[440px] rounded-xl bg-surface p-5 shadow-3', className)}
      >
        <h2 id={titleId} className="text-h2 text-primary-900">
          {title}
        </h2>
        {children ? <div className="mt-3 text-body text-ink-700">{children}</div> : null}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}
