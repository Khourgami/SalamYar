import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { isApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { InlineSpinner } from '@/components/States'
import { TopBanner } from '@/components/TopBanner'
import {
  APP_NAME,
  LOGIN_ERROR,
  LOGIN_PASSWORD,
  LOGIN_SUBMIT,
  LOGIN_USERNAME,
  NETWORK_ERROR,
} from '@/i18n/uiText'

/** UI_SPEC §3.1 — plain React state, hand-written validation. */
export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const trimmedUsername = username.trim()
    if (!trimmedUsername || !password) {
      setError(LOGIN_ERROR)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await login({ username: trimmedUsername, password })
      navigate('/', { replace: true })
    } catch (caught) {
      // 401 (and a 400 validation error) both mean "the credentials did not work".
      if (isApiError(caught) && (caught.status === 401 || caught.status === 400)) {
        setError(LOGIN_ERROR)
      } else {
        setError(NETWORK_ERROR)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBanner />
      <div className="flex justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-center text-lg font-bold text-gray-900">{APP_NAME}</h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700">
                {LOGIN_USERNAME}
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                dir="ltr"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                {LOGIN_PASSWORD}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? <InlineSpinner /> : null}
              {LOGIN_SUBMIT}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
