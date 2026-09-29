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
      className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800"
      data-testid="forbidden"
    >
      <h1 className="text-lg font-bold">{FORBIDDEN}</h1>
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
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-600">
      <h1 className="text-lg font-bold">{NOT_FOUND}</h1>
    </div>
  )
}
