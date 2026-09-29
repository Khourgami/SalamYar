import { useState } from 'react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { createQueryClient } from '@/app/queryClient'
import { AuthProvider } from '@/auth/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { NotFoundPage, RequireAdmin, RequireAuth } from '@/components/Guards'
import { AdminDashboardPage } from '@/pages/AdminDashboardPage'
import { AdminSessionDetailPage } from '@/pages/AdminSessionDetailPage'
import { AdminSessionsPage } from '@/pages/AdminSessionsPage'
import { DoctorsPage } from '@/pages/DoctorsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { SessionPage } from '@/pages/SessionPage'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

/** UI_SPEC §2 — the route table. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DoctorsPage />} />
        <Route path="/sessions/:id" element={<SessionPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/sessions"
          element={
            <RequireAdmin>
              <AdminSessionsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/sessions/:id"
          element={
            <RequireAdmin>
              <AdminSessionDetailPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

/** Opt in early to the React Router v7 behaviours so the console stays clean. */
export const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

export default function App() {
  return (
    <BrowserRouter future={ROUTER_FUTURE_FLAGS}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
