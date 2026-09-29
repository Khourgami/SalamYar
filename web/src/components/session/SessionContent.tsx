import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { SessionDetail } from '@/api/types'
import { Toast } from '@/components/ui/Toast'
import { BackstagePanel } from '@/components/session/BackstagePanel'
import { ChatPanel } from '@/components/session/ChatPanel'
import { EvaluationForm } from '@/components/session/EvaluationForm'
import { EvaluationSummary } from '@/components/session/EvaluationSummary'
import { ResultCard } from '@/components/session/ResultCard'
import { RevealBox } from '@/components/session/RevealBox'
import { EVALUATION_LOCKED, NEXT_DOCTOR } from '@/i18n/uiText'

export interface SessionContentProps {
  session: SessionDetail
  /** Admin detail view: no composer, feedback read-only, reveal always visible. */
  readOnly?: boolean
}

/**
 * UI_SPEC §3.3 — the chat stays visible once the session is completed and the result card, the
 * backstage panel and the evaluation section follow below it in that order.
 */
export function SessionContent({ session, readOnly = false }: SessionContentProps) {
  const completed = session.status === 'completed'
  const evaluated = session.evaluation !== null
  // The toast lives here, above the form, so it survives the refetch that removes the form.
  const [toast, setToast] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <ChatPanel session={session} readOnly={readOnly} />

      {completed ? (
        <div className="flex flex-col gap-6" data-testid="completed-view">
          {session.result ? <ResultCard result={session.result} /> : null}
          <BackstagePanel session={session} />

          {session.evaluation ? <EvaluationSummary evaluation={session.evaluation} /> : null}
          {!evaluated && !readOnly ? (
            <EvaluationForm session={session} onEvaluationLocked={() => setToast(EVALUATION_LOCKED)} />
          ) : null}

          {session.reveal ? <RevealBox reveal={session.reveal} /> : null}

          {evaluated && !readOnly ? (
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-button text-white hover:[filter:brightness(.92)] sm:w-auto"
            >
              {NEXT_DOCTOR}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
