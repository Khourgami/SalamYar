import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { adminGetSession } from '@/api/endpoints'
import { ErrorState, LoadingState } from '@/components/States'
import { SessionContent } from '@/components/session/SessionContent'
import { sessionQueryKey } from '@/components/session/sessionCache'
import { ADMIN_SESSIONS_TITLE } from '@/i18n/uiText'

/**
 * UI_SPEC §3.6 — reuses the session page components read-only, with the reveal always visible
 * (`GET /admin/sessions/{id}`) and the feedback of all users.
 */
export function AdminSessionDetailPage() {
  const { id = '' } = useParams()
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey(id),
    queryFn: () => adminGetSession(id),
    enabled: id !== '',
  })

  return (
    <section className="space-y-4">
      <Link to="/admin/sessions" className="text-body-strong text-primary-600 hover:underline">
        {ADMIN_SESSIONS_TITLE}
      </Link>

      {sessionQuery.isPending ? <LoadingState rows={4} /> : null}
      {sessionQuery.isError || !sessionQuery.data ? (
        <ErrorState onRetry={() => void sessionQuery.refetch()} />
      ) : (
        <SessionContent session={sessionQuery.data} readOnly />
      )}
    </section>
  )
}
