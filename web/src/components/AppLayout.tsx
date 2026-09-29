import { useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { TopBanner } from '@/components/TopBanner'
import { Drawer } from '@/components/shell/Drawer'
import { MobileTopBar } from '@/components/shell/MobileTopBar'
import { SidebarNav } from '@/components/shell/SidebarNav'
import { APP_NAME } from '@/i18n/uiText'

/**
 * UI_SPEC §2 / DESIGN_SYSTEM §4 — sidebar at ≥1024px, top bar + drawer below that, and the
 * non-closable test banner on every protected page.
 */
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <aside
        data-testid="sidebar"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[248px] lg:shrink-0"
      >
        <SidebarNav />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileTopBar triggerRef={menuButtonRef} onOpen={() => setDrawerOpen(true)} />
        <TopBanner />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        <footer className="px-4 py-4 text-center text-caption text-ink-500">{APP_NAME}</footer>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        triggerRef={menuButtonRef}
      />
    </div>
  )
}
