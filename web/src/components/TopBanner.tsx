import { TriangleAlert } from 'lucide-react'

import { BANNER } from '@/i18n/uiText'

/**
 * UI_SPEC §1 — shown on every page and cannot be closed.
 */
export function TopBanner() {
  return (
    <div
      className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900"
      role="note"
      data-testid="top-banner"
    >
      <span className="inline-flex items-center gap-2">
        <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{BANNER}</span>
      </span>
    </div>
  )
}
