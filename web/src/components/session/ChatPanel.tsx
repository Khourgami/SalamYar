import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Send, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ApiError, isApiError } from '@/api/client'
import { finishSession, postMessage } from '@/api/endpoints'
import type { SessionDetail, TurnResponse } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { MessageBubble } from '@/components/session/MessageBubble'
import {
  appendAgentErrorMessages,
  findFeedback,
  lastPatientText,
  updateSession,
  writeSession,
} from '@/components/session/sessionCache'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Toast } from '@/components/ui/Toast'
import { SESSION_STATUS_LABELS } from '@/i18n/labels'
import {
  CHAT_FINISH,
  CHAT_FINISH_CONFIRM,
  CHAT_LOG_LABEL,
  CHAT_PLACEHOLDER,
  CHAT_READ_ONLY,
  CHAT_SEND,
  CHAT_SLOW_TURN,
  CHAT_TYPING,
  NAV_DOCTORS,
  NETWORK_ERROR,
  TURN_IN_PROGRESS,
  questionsCountText,
} from '@/i18n/uiText'
import { faNumber } from '@/lib/format'

/** UI_SPEC v1.2 §3.3 (D-039) — how long a turn may run before the bubble adds its caption. */
const SLOW_TURN_HINT_MS = 15_000

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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
        // «ارسال دوباره» resends the same text without duplicating it.
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

  /** UI_SPEC v1.2 §3.3 (D-039) — the slow-turn caption. Reset for every new turn and removed as
   * soon as the turn ends (success, error or timeout), so it can never outlive the typing bubble. */
  const [slowTurn, setSlowTurn] = useState(false)
  useEffect(() => {
    setSlowTurn(false)
    if (!busy) return undefined
    const timer = setTimeout(() => setSlowTurn(true), SLOW_TURN_HINT_MS)
    return () => clearTimeout(timer)
  }, [busy])

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

  // DESIGN_SYSTEM §6.3 — the composer grows from 1 to 5 lines.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    const next = Math.min(element.scrollHeight, 128)
    element.style.height = next > 0 ? `${next}px` : 'auto'
  }, [draft])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(draft)
    }
  }

  const canSend = !locked && !busy && draft.trim() !== ''

  return (
    <Card padded={false} data-testid="chat-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-10 lg:z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-body-strong text-primary-600 hover:underline"
        >
          <ChevronRight aria-hidden="true" className="icon-dir h-4 w-4" />
          {NAV_DOCTORS}
        </Link>

        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
          <Stethoscope aria-hidden="true" className="h-4 w-4" />
        </span>
        <h2 className="text-h2 text-primary-900">{session.agent.display_name}</h2>

        <span data-testid="session-status">
          <Badge tone={isCompleted ? 'neutral' : 'success'}>
            {isCompleted ? SESSION_STATUS_LABELS.completed : SESSION_STATUS_LABELS.active}
          </Badge>
        </span>

        <span className="text-caption text-ink-500" data-testid="questions-counter">
          {questionsCountText(faNumber(session.questions_asked))}
        </span>

        {!readOnly && !isCompleted ? (
          <Button
            variant="secondary"
            className="ms-auto"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            {CHAT_FINISH}
          </Button>
        ) : null}
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

        {busy ? (
          <li className="flex flex-col items-start gap-1" data-testid="typing-indicator">
            <span className="mb-1 text-caption text-ink-500">{session.agent.display_name}</span>
            <span className="inline-flex flex-col gap-1 rounded-lg rounded-ss-sm border border-line bg-surface px-4 py-3 text-ink-700">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:300ms]" />
                </span>
                <span className="sr-only">{CHAT_TYPING}</span>
              </span>
              {slowTurn ? (
                <span className="text-caption text-ink-500" data-testid="slow-turn-hint">
                  {CHAT_SLOW_TURN}
                </span>
              ) : null}
            </span>
          </li>
        ) : null}

        <div ref={bottomRef} />
      </ol>

      {readOnly || isCompleted ? (
        <footer className="border-t border-line px-4 py-3 text-caption text-ink-500">
          {CHAT_READ_ONLY}
        </footer>
      ) : (
        <footer className="sticky bottom-0 z-10 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              aria-label={CHAT_PLACEHOLDER}
              placeholder={CHAT_PLACEHOLDER}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={busy}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-body text-ink-900 placeholder:text-ink-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-disabled-bg"
            />
            <Button
              type="button"
              size="lg"
              aria-label={CHAT_SEND}
              disabled={!canSend}
              onClick={() => handleSend(draft)}
            >
              <Send aria-hidden="true" className="icon-dir h-4 w-4" />
              <span className="hidden md:inline">{CHAT_SEND}</span>
            </Button>
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
    </Card>
  )
}
