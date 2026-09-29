import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { getSession } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { SessionContent } from '@/components/session/SessionContent'
import { sessionQueryKey } from '@/components/session/sessionCache'
import { NETWORK_ERROR } from '@/i18n/uiText'

/** UI_SPEC §3.3 — chat → result card → backstage → evaluation. */
export function SessionPage() {
  const { id = '' } = useParams()
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey(id),
    queryFn: () => getSession(id),
    enabled: id !== '',
  })

  if (sessionQuery.isPending) return <LoadingState rows={4} />
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState onRetry={() => void sessionQuery.refetch()} />
  }

  if (id === '') return <EmptyState message={NETWORK_ERROR} />

  return <SessionContent session={sessionQuery.data} />
}
