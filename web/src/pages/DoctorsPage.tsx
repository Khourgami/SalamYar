import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { createSession, listAgents } from '@/api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  DOCTORS_EMPTY,
  DOCTORS_HINT,
  DOCTORS_START,
  DOCTORS_TITLE,
  NETWORK_ERROR,
} from '@/i18n/uiText'

/**
 * UI_SPEC §3.2 / DESIGN_SYSTEM §6.2 — a responsive grid of blind doctors.
 *
 * The agent `id` is never rendered: it is only used as a React key and as the `POST /sessions`
 * payload. Every card shows the **same** neutral avatar; architecture and model stay hidden until
 * the evaluation is submitted.
 */
export function DoctorsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  })

  const startMutation = useMutation({
    mutationFn: (agentId: string) => createSession({ agent_id: agentId }),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
    onError: () => {
      setError(NETWORK_ERROR)
    },
  })

  if (agentsQuery.isPending) return <LoadingState rows={3} />
  if (agentsQuery.isError) {
    return <ErrorState onRetry={() => void agentsQuery.refetch()} />
  }

  const agents = agentsQuery.data ?? []

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h1 text-primary-900">{DOCTORS_TITLE}</h1>

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {agents.length === 0 ? (
        <EmptyState message={DOCTORS_EMPTY} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map((agent) => {
            const isStarting = startMutation.isPending && startMutation.variables === agent.id
            return (
              <li key={agent.id} className="h-full">
                <Card className="flex h-full flex-col items-center gap-3 text-center">
                  <span
                    data-testid="doctor-avatar"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600"
                  >
                    <Stethoscope aria-hidden="true" className="h-7 w-7" />
                  </span>
                  <h3 className="text-h3 text-ink-900">{agent.display_name}</h3>
                  {agent.description ? (
                    <p className="text-caption text-ink-500">{agent.description}</p>
                  ) : null}
                  <Button
                    variant="secondary"
                    fullWidth
                    className="mt-auto"
                    loading={isStarting}
                    disabled={startMutation.isPending}
                    onClick={() => startMutation.mutate(agent.id)}
                  >
                    {DOCTORS_START}
                  </Button>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Alert tone="info">{DOCTORS_HINT}</Alert>
    </section>
  )
}
