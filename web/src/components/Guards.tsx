import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { FORBIDDEN, NOT_FOUND } from '@/i18n/uiText'

/** Unauthenticated visitors are sent to `/login`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

export function ForbiddenPage() {
  return (
    <div
      className="rounded-lg border border-danger-600 bg-danger-100 p-6 text-center text-danger-700"
      data-testid="forbidden"
    >
      <h1 className="text-h2">{FORBIDDEN}</h1>
    </div>
  )
}

/** UI_SPEC §2 — `/admin*` is admin-only; everyone else sees «دسترسی ندارید». */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()

  if (!isAdmin) return <ForbiddenPage />
  return <>{children}</>
}

export function NotFoundPage() {
  return (
    <div className="rounded-lg border border-line bg-surface p-6 text-center text-ink-700">
      <h1 className="text-h2">{NOT_FOUND}</h1>
    </div>
  )
}
