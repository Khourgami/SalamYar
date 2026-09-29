import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { createSession, listAgents } from '@/api/endpoints'
import { EmptyState, ErrorState, InlineSpinner, LoadingState } from '@/components/States'
import {
  DOCTORS_EMPTY,
  DOCTORS_HINT,
  DOCTORS_START,
  DOCTORS_TITLE,
  NETWORK_ERROR,
} from '@/i18n/uiText'

/**
 * UI_SPEC §3.2 — a grid of blind doctors.
 *
 * The agent `id` is never rendered: it is only used as a React key and as the `POST /sessions`
 * payload. Architecture and model stay hidden until the evaluation is submitted.
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
    <section className="space-y-6">
      <h1 className="text-lg font-bold text-gray-900">{DOCTORS_TITLE}</h1>

      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {agents.length === 0 ? (
        <EmptyState message={DOCTORS_EMPTY} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const isStarting = startMutation.isPending && startMutation.variables === agent.id
            return (
              <li
                key={agent.id}
                className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-5 text-center shadow-sm"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Stethoscope aria-hidden="true" className="h-7 w-7" />
                </span>
                <h2 className="text-base font-semibold text-gray-900">{agent.display_name}</h2>
                {agent.description ? (
                  <p className="text-sm text-gray-500">{agent.description}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => startMutation.mutate(agent.id)}
                  disabled={startMutation.isPending}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {isStarting ? <InlineSpinner /> : null}
                  {DOCTORS_START}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-600">{DOCTORS_HINT}</p>
    </section>
  )
}
