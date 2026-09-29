import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { NotebookPen } from 'lucide-react'

import { deleteFeedback, putFeedback } from '@/api/endpoints'
import type { Feedback, Message } from '@/api/types'
import {
  CHAT_FEEDBACK_CANCEL,
  CHAT_FEEDBACK_DOWN,
  CHAT_FEEDBACK_NOTE,
  CHAT_FEEDBACK_READ_ONLY,
  CHAT_FEEDBACK_SAVE,
  CHAT_FEEDBACK_UP,
  CHAT_NOTE_NEEDS_RATING,
} from '@/i18n/uiText'
import { dropFeedback, replaceFeedback, updateSession } from '@/components/session/sessionCache'

export interface FeedbackControlsProps {
  sessionId: string
  message: Message
  feedback: Feedback | undefined
  /** Read-only when the viewer is an admin or the evaluation has been submitted. */
  readOnly: boolean
}

/**
 * UI_SPEC §3.3 — 👍/👎 plus an inline note under every `question`/`result` agent message.
 * Clicking the active rating again removes it (`DELETE`).
 */
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
      <div className="mt-1 flex flex-col items-start gap-1 text-xs text-gray-500">
        {rating ? <span>{rating === 'up' ? '👍' : '👎'}</span> : null}
        {feedback?.note ? <span className="text-gray-600">{feedback.note}</span> : null}
        <span className="text-gray-400">{CHAT_FEEDBACK_READ_ONLY}</span>
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
          className={clsx(
            'rounded border px-2 py-0.5 text-sm leading-none transition-colors disabled:opacity-50',
            rating === 'up'
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 hover:bg-gray-50',
          )}
        >
          👍
        </button>
        <button
          type="button"
          aria-label={CHAT_FEEDBACK_DOWN}
          aria-pressed={rating === 'down'}
          disabled={busy}
          onClick={() => toggleRating('down')}
          className={clsx(
            'rounded border px-2 py-0.5 text-sm leading-none transition-colors disabled:opacity-50',
            rating === 'down' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50',
          )}
        >
          👎
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((open) => !open)}
          className="ms-1 inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
        >
          <NotebookPen aria-hidden="true" className="h-3.5 w-3.5" />
          {CHAT_FEEDBACK_NOTE}
        </button>
      </div>

      {noteOpen ? (
        <div className="w-full max-w-md space-y-1">
          <textarea
            aria-label={CHAT_FEEDBACK_NOTE}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none"
          />
          {!rating ? <p className="text-xs text-amber-700">{CHAT_NOTE_NEEDS_RATING}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNote}
              disabled={busy || !rating}
              className="rounded bg-teal-700 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:bg-gray-300"
            >
              {CHAT_FEEDBACK_SAVE}
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {CHAT_FEEDBACK_CANCEL}
            </button>
          </div>
        </div>
      ) : feedback?.note ? (
        <p className="text-xs text-gray-600">{feedback.note}</p>
      ) : null}
    </div>
  )
}
