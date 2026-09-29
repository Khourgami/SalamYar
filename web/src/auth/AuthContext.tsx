import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  AUTH_CLEARED_EVENT,
  clearStoredAuth,
  readStoredToken,
  readStoredUser,
  writeStoredAuth,
} from '@/api/client'
import { login as loginRequest } from '@/api/endpoints'
import type { LoginRequest, User } from '@/api/types'

export interface AuthContextValue {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  /** Authenticate and persist the token + user. Throws `ApiError` on failure. */
  login: (input: LoginRequest) => Promise<User>
  /** Clear the stored auth. Guards then redirect to `/login`. */
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [user, setUser] = useState<User | null>(() => readStoredUser<User>())

  // `clearStoredAuth` is the single place that drops the session (logout and any 401).
  useEffect(() => {
    const handleCleared = () => {
      setToken(null)
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener(AUTH_CLEARED_EVENT, handleCleared)
    return () => {
      window.removeEventListener(AUTH_CLEARED_EVENT, handleCleared)
    }
  }, [queryClient])

  const login = useCallback(async (input: LoginRequest) => {
    const response = await loginRequest(input)
    writeStoredAuth(response.access_token, response.user)
    setToken(response.access_token)
    setUser(response.user)
    return response.user
  }, [])

  const logout = useCallback(() => {
    clearStoredAuth()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === 'admin',
      login,
      logout,
    }),
    [login, logout, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
