import clsx from 'clsx'
import { History, LayoutDashboard, ListChecks, LogOut, Stethoscope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { LogoMark } from '@/components/shell/LogoMark'
import {
  APP_NAME,
  NAV_ALL_SESSIONS,
  NAV_DASHBOARD,
  NAV_DOCTORS,
  NAV_HISTORY,
  NAV_LOGOUT,
} from '@/i18n/uiText'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
}

function itemClass({ isActive }: { isActive: boolean }): string {
  return clsx(
    'flex h-11 items-center gap-3 rounded-md px-3 text-body-strong transition-colors',
    isActive
      ? 'bg-white/[0.14] text-white'
      : 'text-white/[0.78] hover:bg-white/[0.08] hover:text-white',
  )
}

/**
 * DESIGN_SYSTEM §4.1 — the sidebar and the drawer share this content: the logo + app name, the
 * UI_SPEC §2 items (role-gated) and the display name + logout at the bottom.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, logout } = useAuth()

  const items: NavItem[] = [
    { to: '/', label: NAV_DOCTORS, icon: Stethoscope, end: true },
    { to: '/history', label: NAV_HISTORY, icon: History, end: false },
    ...(isAdmin
      ? [
          { to: '/admin', label: NAV_DASHBOARD, icon: LayoutDashboard, end: true },
          { to: '/admin/sessions', label: NAV_ALL_SESSIONS, icon: ListChecks, end: true },
        ]
      : []),
  ]

  return (
    <div className="flex h-full flex-col bg-primary-900 px-3 py-4 text-white">
      <div className="flex items-center gap-2 px-2 pb-6">
        <LogoMark size={32} />
        <span className="text-h3 text-white">{APP_NAME}</span>
      </div>

      <nav aria-label={APP_NAME} className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={itemClass}
          >
            <item.icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 border-t border-white/[0.14] pt-4">
        <p className="px-2 text-caption text-white/[0.78]" data-testid="header-display-name">
          {user?.display_name}
        </p>
        <button type="button" onClick={logout} className={clsx('mt-1 w-full', itemClass({ isActive: false }))}>
          <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
          {NAV_LOGOUT}
        </button>
      </div>
    </div>
  )
}
