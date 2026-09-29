import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { isApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { TopBanner } from '@/components/TopBanner'
import { LogoMark } from '@/components/shell/LogoMark'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import {
  APP_NAME,
  LOGIN_BRAND_LINE,
  LOGIN_ERROR,
  LOGIN_PASSWORD,
  LOGIN_SUBMIT,
  LOGIN_TITLE,
  LOGIN_USERNAME,
  NETWORK_ERROR,
} from '@/i18n/uiText'

/** UI_SPEC §3.1 / DESIGN_SYSTEM §6.1 — two columns on desktop, one on mobile. */
export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const usernameRef = useRef<HTMLInputElement>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  function fail(message: string) {
    setError(message)
    // DESIGN_SYSTEM §6.1 — after a failed login, focus moves to the username field.
    usernameRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const trimmedUsername = username.trim()
    if (!trimmedUsername || !password) {
      fail(LOGIN_ERROR)
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
        fail(LOGIN_ERROR)
      } else {
        fail(NETWORK_ERROR)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <TopBanner />

      <div className="mx-auto grid w-full max-w-[1280px] lg:min-h-[calc(100vh-3rem)] lg:grid-cols-2">
        <div className="flex items-center justify-center px-4 py-10 lg:px-10">
          <div className="w-full max-w-[400px]">
            {/* mobile: the brand panel collapses to the logo + app name above the form */}
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <LogoMark size={40} />
              <span className="text-h2 text-primary-900">{APP_NAME}</span>
            </div>

            <Card>
              <h1 className="mb-6 text-h1 text-primary-900">{LOGIN_TITLE}</h1>

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                <TextField
                  ref={usernameRef}
                  id="username"
                  name="username"
                  label={LOGIN_USERNAME}
                  dir="ltr"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />

                <PasswordField
                  id="password"
                  label={LOGIN_PASSWORD}
                  value={password}
                  onChange={setPassword}
                />

                {error ? (
                  <Alert tone="danger" role="alert">
                    {error}
                  </Alert>
                ) : null}

                <Button type="submit" size="lg" fullWidth loading={submitting}>
                  {LOGIN_SUBMIT}
                </Button>
              </form>
            </Card>
          </div>
        </div>

        <div className="hidden flex-col items-center justify-center gap-4 bg-primary-100 px-10 py-16 text-center lg:flex">
          <LogoMark size={64} />
          <p className="text-display text-primary-900">{APP_NAME}</p>
          <p className="text-body-l text-ink-700">{LOGIN_BRAND_LINE}</p>
        </div>
      </div>
    </div>
  )
}
