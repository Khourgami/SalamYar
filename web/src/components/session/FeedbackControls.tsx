import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'

import { deleteFeedback, putFeedback } from '@/api/endpoints'
import type { Feedback, Message } from '@/api/types'
import { dropFeedback, replaceFeedback, updateSession } from '@/components/session/sessionCache'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import {
  CHAT_FEEDBACK_CANCEL,
  CHAT_FEEDBACK_DOWN,
  CHAT_FEEDBACK_NOTE,
  CHAT_FEEDBACK_READ_ONLY,
  CHAT_FEEDBACK_SAVE,
  CHAT_FEEDBACK_UP,
  CHAT_NOTE_NEEDS_RATING,
} from '@/i18n/uiText'

export interface FeedbackControlsProps {
  sessionId: string
  message: Message
  feedback: Feedback | undefined
  /** Read-only when the viewer is an admin or the evaluation has been submitted. */
  readOnly: boolean
}

/** DESIGN_SYSTEM §5.11 — two 32px toggle buttons plus a ghost «یادداشت» and an inline note. */
export function FeedbackControls({
  sessionId,
  message,
  feedback,
  readOnly,
}: FeedbackControlsProps) {
  const queryClient = useQueryClient()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(feedback?.note ?? '')

  useEffect(() => {
    setNote(feedback?.note ?? '')
  }, [feedback?.note])

  const rating = feedback?.rating ?? null

  const putMutation = useMutation({
    mutationFn: (input: { rating: 'up' | 'down'; note: string | null }) =>
      putFeedback(message.id, input),
    onSuccess: (row) => {
      updateSession(queryClient, sessionId, (session) => replaceFeedback(session, row))
      setNoteOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteFeedback(message.id),
    onSuccess: () => {
      updateSession(queryClient, sessionId, (session) => dropFeedback(session, message.id))
      setNoteOpen(false)
    },
  })

  const busy = putMutation.isPending || deleteMutation.isPending

  function toggleRating(next: 'up' | 'down') {
    if (readOnly || busy) return
    if (rating === next) {
      deleteMutation.mutate()
      return
    }
    putMutation.mutate({ rating: next, note: feedback?.note ?? null })
  }

  function saveNote() {
    if (readOnly || busy || !rating) return
    putMutation.mutate({ rating, note: note.trim() === '' ? null : note.trim() })
  }

  if (readOnly) {
    return (
      <div className="mt-1 flex flex-col items-start gap-1 text-caption text-ink-500">
        {rating ? (
          <span className="inline-flex items-center gap-1">
            {rating === 'up' ? (
              <ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <ThumbsDown aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </span>
        ) : null}
        {feedback?.note ? <span className="text-ink-700">{feedback.note}</span> : null}
        <span className="text-ink-500">{CHAT_FEEDBACK_READ_ONLY}</span>
      </div>
    )
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={CHAT_FEEDBACK_UP}
          aria-pressed={rating === 'up'}
          disabled={busy}
          onClick={() => toggleRating('up')}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-50',
            rating === 'up'
              ? 'border-success-600 bg-success-100 text-success-700'
              : 'border-line bg-surface text-ink-500 hover:bg-primary-100',
          )}
        >
          <ThumbsUp aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={CHAT_FEEDBACK_DOWN}
          aria-pressed={rating === 'down'}
          disabled={busy}
          onClick={() => toggleRating('down')}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-50',
            rating === 'down'
              ? 'border-danger-600 bg-danger-100 text-danger-700'
              : 'border-line bg-surface text-ink-500 hover:bg-primary-100',
          )}
        >
          <ThumbsDown aria-hidden="true" className="h-4 w-4" />
        </button>
        <Button
          variant="ghost"
          className="ms-1 h-8 px-2"
          onClick={() => setNoteOpen((open) => !open)}
        >
          {CHAT_FEEDBACK_NOTE}
        </Button>
      </div>

      {noteOpen ? (
        <div className="w-full max-w-md space-y-1">
          <textarea
            aria-label={CHAT_FEEDBACK_NOTE}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-md border border-line bg-surface px-2 py-1 text-caption text-ink-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          {!rating ? <p className="text-caption text-warning-700">{CHAT_NOTE_NEEDS_RATING}</p> : null}
          <div className="flex gap-2">
            <Button disabled={busy || !rating} onClick={saveNote} className="h-8 px-2">
              {CHAT_FEEDBACK_SAVE}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setNoteOpen(false)}
              className="h-8 px-2"
            >
              {CHAT_FEEDBACK_CANCEL}
            </Button>
          </div>
        </div>
      ) : feedback?.note ? (
        <p className="text-caption text-ink-700">{feedback.note}</p>
      ) : null}
    </div>
  )
}
