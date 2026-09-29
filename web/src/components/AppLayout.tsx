import { Outlet } from 'react-router-dom'

import { Header } from '@/components/Header'
import { TopBanner } from '@/components/TopBanner'
import { APP_NAME } from '@/i18n/uiText'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TopBanner />
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 bg-white px-4 py-3 text-center text-xs text-gray-400">
        {APP_NAME}
      </footer>
    </div>
  )
}
