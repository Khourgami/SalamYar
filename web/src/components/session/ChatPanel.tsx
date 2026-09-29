import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'

import { ApiError, isApiError } from '@/api/client'
import { finishSession, postMessage } from '@/api/endpoints'
import type { SessionDetail, TurnResponse } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineSpinner } from '@/components/States'
import { Toast } from '@/components/Toast'
import { MessageBubble } from '@/components/session/MessageBubble'
import {
  appendAgentErrorMessages,
  findFeedback,
  lastPatientText,
  updateSession,
  writeSession,
} from '@/components/session/sessionCache'
import { faNumber } from '@/lib/format'
import {
  CHAT_FINISH,
  CHAT_FINISH_CONFIRM,
  CHAT_LOG_LABEL,
  CHAT_PLACEHOLDER,
  CHAT_READ_ONLY,
  CHAT_SEND,
  CHAT_TYPING,
  NETWORK_ERROR,
  TURN_IN_PROGRESS,
  questionsCountText,
} from '@/i18n/uiText'

export interface ChatPanelProps {
  session: SessionDetail
  /** Admin detail view: no composer, finish button hidden. */
  readOnly?: boolean
}

export function ChatPanel({ session, readOnly = false }: ChatPanelProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const isCompleted = session.status === 'completed'
  const locked = readOnly || isCompleted

  const sendMutation = useMutation({
    mutationFn: (text: string) => postMessage(session.id, text),
    onSuccess: (turn: TurnResponse) => {
      writeSession(queryClient, session.id, turn.session)
    },
    onError: (error: unknown, variables: string) => {
      const apiError: ApiError = isApiError(error)
        ? error
        : new ApiError(0, 'NETWORK_ERROR', 'Unexpected failure.')

      if (apiError.code === 'AGENT_ERROR') {
        // The patient message was saved and an `error` agent message appended server-side;
        // `الررسال دوباره` resends the same text without duplicating it.
        const body = apiError.agentErrorBody
        if (body) {
          updateSession(queryClient, session.id, (current) =>
            appendAgentErrorMessages(current, body),
          )
        }
        return
      }

      // Give the evaluator their text back so it can be sent again.
      setDraft(variables)
      setToast(apiError.code === 'TURN_IN_PROGRESS' ? TURN_IN_PROGRESS : NETWORK_ERROR)
      void queryClient.invalidateQueries({ queryKey: ['session', session.id] })
    },
  })

  const finishMutation = useMutation({
    mutationFn: () => finishSession(session.id),
    onSuccess: (turn: TurnResponse) => {
      writeSession(queryClient, session.id, turn.session)
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: () => {
      setToast(NETWORK_ERROR)
    },
  })

  const busy = sendMutation.isPending || finishMutation.isPending
  const messages = session.messages

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (readOnly || isCompleted || busy || trimmed === '') return
      setDraft('')
      sendMutation.mutate(trimmed)
    },
    [busy, isCompleted, readOnly, sendMutation],
  )

  const lastText = useMemo(() => lastPatientText(session), [session])

  // Auto-scroll to the newest message. `scrollIntoView` is missing under jsdom.
  useEffect(() => {
    const node = bottomRef.current
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'end' })
    }
  }, [messages.length, sendMutation.isPending, finishMutation.isPending])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(draft)
    }
  }

  const canSend = !locked && !busy && draft.trim() !== ''

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">{session.agent.display_name}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500" data-testid="questions-counter">
            {questionsCountText(faNumber(session.questions_asked))}
          </span>
          {!readOnly && !isCompleted ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="rounded border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
            >
              {CHAT_FINISH}
            </button>
          ) : null}
        </div>
      </header>

      <ol
        role="log"
        aria-live="polite"
        aria-label={CHAT_LOG_LABEL}
        className="flex max-h-[60vh] min-h-[16rem] flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            session={session}
            message={message}
            feedback={findFeedback(session, message.id)}
            readOnly={readOnly}
            onResend={handleSend}
            resendDisabled={locked || busy || !lastText}
          />
        ))}

        {sendMutation.isPending || finishMutation.isPending ? (
          <li className="flex flex-col items-start gap-1" data-testid="typing-indicator">
            <span className="text-xs text-gray-500">{session.agent.display_name}</span>
            <span className="inline-flex items-center gap-2 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-2 text-sm text-gray-700">
              <InlineSpinner className="text-teal-700" />
              {CHAT_TYPING}
            </span>
          </li>
        ) : null}

        <div ref={bottomRef} />
      </ol>

      {readOnly || isCompleted ? (
        <footer className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
          {CHAT_READ_ONLY}
        </footer>
      ) : (
        <footer className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              aria-label={CHAT_PLACEHOLDER}
              placeholder={CHAT_PLACEHOLDER}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={busy}
              className="flex-1 resize-y rounded border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-100"
            />
            <button
              type="button"
              onClick={() => handleSend(draft)}
              disabled={!canSend}
              className="inline-flex items-center gap-2 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {CHAT_SEND}
            </button>
          </div>
        </footer>
      )}

      <ConfirmDialog
        open={confirmOpen}
        message={CHAT_FINISH_CONFIRM}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          finishMutation.mutate()
        }}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </section>
  )
}
