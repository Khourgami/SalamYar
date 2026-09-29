import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { SidebarNav } from '@/components/shell/SidebarNav'
import { CHAT_FEEDBACK_CANCEL } from '@/i18n/uiText'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * DESIGN_SYSTEM §4.2 — a drawer from the inline-start edge with the sidebar content.
 * Traps focus, closes on Escape, on overlay click and on navigation, and returns focus to the
 * menu button that opened it.
 */
export function Drawer({
  open,
  onClose,
  triggerRef,
}: {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement>
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const panel = panelRef.current
    const trigger = triggerRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open, onClose, triggerRef])

  if (!open) return null

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={CHAT_FEEDBACK_CANCEL}
        data-testid="drawer-overlay"
        onClick={onClose}
        className="overlay-scrim fixed inset-0 z-40 h-full w-full cursor-default"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        data-testid="drawer"
        className="fixed inset-y-0 start-0 z-50 w-[280px] shadow-2"
      >
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  )
}
