import clsx from 'clsx'
import { RotateCcw, Stethoscope } from 'lucide-react'

import type { Feedback, Message, SessionDetail } from '@/api/types'
import { FeedbackControls } from '@/components/session/FeedbackControls'
import { isFeedbackLocked } from '@/components/session/sessionCache'
import { Button } from '@/components/ui/Button'
import { CHAT_PATIENT_LABEL, CHAT_RESEND } from '@/i18n/uiText'
import { faTime } from '@/lib/format'

export interface MessageBubbleProps {
  session: SessionDetail
  message: Message
  feedback: Feedback | undefined
  readOnly: boolean
  onResend: (text: string) => void
  resendDisabled: boolean
}

/**
 * DESIGN_SYSTEM §5.11 / UI_SPEC §3.3 — agent bubbles sit on the inline-start side (right in RTL)
 * with a neutral avatar and the agent's `display_name`; patient bubbles sit on the inline-end side
 * labelled «شما (بیمار)». `error` messages are neutral and offer `ارسال دوباره`.
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
      <div className={clsx('mb-1 flex items-center gap-2', !isAgent && 'flex-row-reverse')}>
        {isAgent ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600">
            <Stethoscope aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <span className="text-caption text-ink-500">
          {isAgent ? session.agent.display_name : CHAT_PATIENT_LABEL}
        </span>
      </div>

      <div
        className={clsx(
          'max-w-[85%] rounded-lg px-4 py-2 sm:max-w-[620px]',
          isError
            ? 'rounded-ss-sm bg-neutral-100 text-ink-700'
            : isAgent
              ? 'rounded-ss-sm border border-line bg-surface text-ink-900'
              : 'rounded-se-sm bg-primary-100 text-ink-900',
        )}
      >
        <p className="whitespace-pre-wrap text-body-l">{message.text}</p>

        {isError ? (
          <div className="mt-2">
            <Button
              variant="secondary"
              onClick={() => onResend(message.text)}
              disabled={resendDisabled}
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {CHAT_RESEND}
            </Button>
          </div>
        ) : null}

        <span className="mt-1 block text-caption text-ink-500">{faTime(message.created_at)}</span>
      </div>

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
