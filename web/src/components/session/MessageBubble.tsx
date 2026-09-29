import clsx from 'clsx'
import { RotateCcw } from 'lucide-react'

import type { Feedback, Message, SessionDetail } from '@/api/types'
import { FeedbackControls } from '@/components/session/FeedbackControls'
import { isFeedbackLocked } from '@/components/session/sessionCache'
import { CHAT_PATIENT_LABEL, CHAT_RESEND } from '@/i18n/uiText'

export interface MessageBubbleProps {
  session: SessionDetail
  message: Message
  feedback: Feedback | undefined
  readOnly: boolean
  onResend: (text: string) => void
  resendDisabled: boolean
}

/**
 * UI_SPEC §3.3 — agent bubbles sit on the inline-start side (right in RTL) labelled with the
 * agent's `display_name`; patient bubbles sit on the inline-end side labelled «شما (بیمار)».
 * `error` messages are gray and offer `ارسال دوباره`.
 */
export function MessageBubble({
  session,
  message,
  feedback,
  readOnly,
  onResend,
  resendDisabled,
}: MessageBubbleProps) {
  const isAgent = message.role === 'agent'
  const isError = message.kind === 'error'
  const supportsFeedback = isAgent && (message.kind === 'question' || message.kind === 'result')

  return (
    <li
      className={clsx('flex flex-col', isAgent ? 'items-start' : 'items-end')}
      data-testid={`message-${message.kind}`}
    >
      <span className="mb-1 text-xs text-gray-500">
        {isAgent ? session.agent.display_name : CHAT_PATIENT_LABEL}
      </span>

      <div
        className={clsx(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl border px-4 py-2 text-sm leading-6 sm:max-w-[75%]',
          isError
            ? 'border-gray-300 bg-gray-200 text-gray-700'
            : isAgent
              ? 'border-teal-100 bg-teal-50 text-gray-900'
              : 'border-gray-200 bg-white text-gray-900',
        )}
      >
        {message.text}
      </div>

      {isError ? (
        <div className="mt-1">
          <button
            type="button"
            disabled={resendDisabled}
            onClick={() => onResend(message.text)}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {CHAT_RESEND}
          </button>
        </div>
      ) : null}

      {supportsFeedback ? (
        <FeedbackControls
          sessionId={session.id}
          message={message}
          feedback={feedback}
          readOnly={readOnly || isFeedbackLocked(session)}
        />
      ) : null}
    </li>
  )
}
