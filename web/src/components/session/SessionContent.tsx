import { Link } from 'react-router-dom'

import type { SessionDetail } from '@/api/types'
import { BackstagePanel } from '@/components/session/BackstagePanel'
import { ChatPanel } from '@/components/session/ChatPanel'
import { EvaluationForm } from '@/components/session/EvaluationForm'
import { EvaluationSummary } from '@/components/session/EvaluationSummary'
import { ResultCard } from '@/components/session/ResultCard'
import { RevealBox } from '@/components/session/RevealBox'
import { NEXT_DOCTOR } from '@/i18n/uiText'

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

  return (
    <div className="space-y-6">
      <ChatPanel session={session} readOnly={readOnly} />

      {completed ? (
        <div className="space-y-6" data-testid="completed-view">
          {session.result ? <ResultCard result={session.result} /> : null}
          <BackstagePanel session={session} />

          {session.evaluation ? <EvaluationSummary evaluation={session.evaluation} /> : null}
          {!evaluated && !readOnly ? <EvaluationForm session={session} /> : null}

          {session.reveal ? <RevealBox reveal={session.reveal} /> : null}

          {evaluated && !readOnly ? (
            <Link
              to="/"
              className="inline-block rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              {NEXT_DOCTOR}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
