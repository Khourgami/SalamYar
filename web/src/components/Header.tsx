import clsx from 'clsx'
import { LogOut } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import {
  APP_NAME,
  NAV_ALL_SESSIONS,
  NAV_DASHBOARD,
  NAV_DOCTORS,
  NAV_HISTORY,
  NAV_LOGOUT,
} from '@/i18n/uiText'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return clsx(
    'rounded px-2 py-1 transition-colors',
    isActive ? 'bg-teal-50 font-semibold text-teal-800' : 'hover:bg-gray-100',
  )
}

/** UI_SPEC §2 — app name, nav links, the display name and a logout link. */
export function Header() {
  const { user, isAdmin, logout } = useAuth()

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="text-base font-bold text-gray-900">
          {APP_NAME}
        </Link>

        <nav aria-label="ناوبری" className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
          <NavLink to="/" end className={navLinkClass}>
            {NAV_DOCTORS}
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            {NAV_HISTORY}
          </NavLink>
          {isAdmin ? (
            <>
              <NavLink to="/admin" end className={navLinkClass}>
                {NAV_DASHBOARD}
              </NavLink>
              <NavLink to="/admin/sessions" end className={navLinkClass}>
                {NAV_ALL_SESSIONS}
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="ms-auto flex items-center gap-3 text-sm">
          <span className="text-gray-700" data-testid="header-display-name">
            {user?.display_name}
          </span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-700 hover:bg-red-50"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {NAV_LOGOUT}
          </button>
        </div>
      </div>
    </header>
  )
}
