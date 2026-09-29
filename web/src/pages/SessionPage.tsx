import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { isApiError } from '@/api/client'
import { getSession } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { SessionContent } from '@/components/session/SessionContent'
import { sessionQueryKey } from '@/components/session/sessionCache'
import { FORBIDDEN, NAV_DOCTORS, NETWORK_ERROR } from '@/i18n/uiText'

/**
 * UI_SPEC §4 — a session that belongs to another user answers `403 FORBIDDEN`. Since §5/§6 are
 * owner-only for every role (v1.1), the page shows the full-page «دسترسی ندارید» state instead of
 * a retryable network error.
 */
function ForbiddenState() {
  return (
    <div
      className="rounded-lg border border-line bg-surface p-6 text-center"
      role="alert"
      data-testid="session-forbidden"
    >
      <p className="text-h2 text-ink-900">{FORBIDDEN}</p>
      <Link to="/" className="mt-3 inline-block text-body-strong text-primary-600 hover:underline">
        {NAV_DOCTORS}
      </Link>
    </div>
  )
}

/** UI_SPEC §3.3 — chat → result card → backstage → evaluation. */
export function SessionPage() {
  const { id = '' } = useParams()
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey(id),
    queryFn: () => getSession(id),
    enabled: id !== '',
  })

  if (sessionQuery.isPending) return <LoadingState rows={4} />

  if (sessionQuery.isError && isApiError(sessionQuery.error) && sessionQuery.error.status === 403) {
    return <ForbiddenState />
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState onRetry={() => void sessionQuery.refetch()} />
  }

  if (id === '') return <EmptyState message={NETWORK_ERROR} />

  return <SessionContent session={sessionQuery.data} />
}
