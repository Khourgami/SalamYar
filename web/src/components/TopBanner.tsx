import { TriangleAlert } from 'lucide-react'

import { BANNER } from '@/i18n/uiText'

/**
 * DESIGN_SYSTEM §4.3 — full width, `warning-100`, a `warning-600` bottom border, an inline-start
 * alert icon and the UI_SPEC §1 text. It cannot be closed and is sticky on every page.
 */
export function TopBanner() {
  return (
    <div
      role="note"
      data-testid="top-banner"
      className="banner-border sticky top-14 z-20 flex items-center justify-center gap-2 bg-warning-100 px-4 py-2 text-body text-ink-900 lg:top-0"
    >
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-600" />
      <span>{BANNER}</span>
    </div>
  )
}
