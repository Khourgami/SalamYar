import { Menu } from 'lucide-react'
import type { RefObject } from 'react'

import { LogoMark } from '@/components/shell/LogoMark'
import { APP_NAME, NAV_MENU } from '@/i18n/uiText'

/** DESIGN_SYSTEM §4.2 — 56px surface bar with a 44×44 menu button and the logo + app name. */
export function MobileTopBar({
  triggerRef,
  onOpen,
}: {
  triggerRef: RefObject<HTMLButtonElement>
  onOpen: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-3 lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={NAV_MENU}
        onClick={onOpen}
        className="flex h-11 w-11 items-center justify-center rounded-md text-primary-900 hover:bg-primary-100"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>
      <LogoMark size={28} />
      <span className="text-h3 text-primary-900">{APP_NAME}</span>
    </header>
  )
}
