import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import type { BackstageTurn, CantMiss, Hypothesis, SessionDetail } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CANT_MISS_STATUS_LABELS, NEXT_ACTION_LABELS, stopReasonLabel } from '@/i18n/labels'
import {
  BACKSTAGE_CANT_MISS,
  BACKSTAGE_CLINICAL_STATE,
  BACKSTAGE_EMERGENCY_PROBABILITY,
  BACKSTAGE_HYPOTHESES,
  BACKSTAGE_NEXT_ACTION,
  BACKSTAGE_QUESTION_RATIONALE,
  BACKSTAGE_REASONING_NOTE,
  BACKSTAGE_STOP_REASON,
  BACKSTAGE_TITLE,
  BACKSTAGE_TOGGLE_HIDE,
  BACKSTAGE_TOGGLE_SHOW,
} from '@/i18n/uiText'
import { faNumber, faPercent } from '@/lib/format'

/* ------------------------------------------------------------------ *
 * Generic renderer for the free-form `clinical_state`
 * ------------------------------------------------------------------ */

function ScalarValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-ink-400">—</span>
  }
  if (typeof value === 'boolean') return <span>{value ? 'بله' : 'خیر'}</span>
  if (typeof value === 'number') return <span>{faNumber(value)}</span>
  return <span>{String(value)}</span>
}

function KeyValueList({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value)
  if (entries.length === 0) return <span className="text-ink-400">—</span>
  return (
    <dl className="space-y-1">
      {entries.map(([key, entryValue]) => (
        <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="ltr shrink-0 text-code font-medium text-ink-500">{key}</dt>
          <dd className="text-body text-ink-700">
            <ClinicalStateValue value={entryValue} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Renders whichever shape the backend produced: scalars, lists of scalars and nested objects.
 * `clinical_state` is `Record<string, unknown>`, so this must never assume a fixed structure.
 */
function ClinicalStateValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-400">—</span>
    const allScalar = value.every((item) => item === null || typeof item !== 'object')
    if (allScalar) {
      return (
        <ul className="list-disc space-y-0.5 ps-4">
          {value.map((item, index) => (
            <li key={index}>
              <ScalarValue value={item} />
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index} className="rounded-md border border-line bg-surface p-2">
            <ClinicalStateValue value={item} />
          </li>
        ))}
      </ul>
    )
  }

  if (value !== null && typeof value === 'object') {
    return <KeyValueList value={value as Record<string, unknown>} />
  }

  return <ScalarValue value={value} />
}

function ClinicalState({ state }: { state: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-body-strong text-ink-700 hover:bg-primary-100"
      >
        <span>{BACKSTAGE_CLINICAL_STATE}</span>
        {open ? (
          <ChevronUp aria-hidden="true" className="h-4 w-4" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-line p-3" data-testid="clinical-state">
          {Object.entries(state).map(([key, value]) => (
            <div key={key}>
              <p className="ltr mb-1 text-code font-semibold text-ink-500">{key}</p>
              <ClinicalStateValue value={value} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Small building blocks
 * ------------------------------------------------------------------ */

function HypothesisMiniTable({ rows }: { rows: Hypothesis[] }) {
  return (
    <table className="w-full border-collapse text-body" data-testid="backstage-hypotheses">
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-line last:border-0">
            <td className="px-1 py-1">
              {row.name_fa}
              <span className="ltr ms-2 text-caption text-ink-500">{row.name_en}</span>
            </td>
            <td className="w-14 px-1 py-1 text-end whitespace-nowrap">{faPercent(row.probability)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CantMissChips({ rows }: { rows: CantMiss[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map((row, index) => (
        <li key={index}>
          <span
            className={`inline-block rounded-pill border px-2.5 py-0.5 text-caption ${CANT_MISS_STATUS_LABELS[row.status].className}`}
          >
            {row.name_fa} · {CANT_MISS_STATUS_LABELS[row.status].label}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-caption font-semibold text-ink-500">{label}</p>
      <div className="text-body text-ink-700">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Turn
 * ------------------------------------------------------------------ */

function BackstageTurnItem({ turn, title }: { turn: BackstageTurn; title: string }) {
  const hasStructuredFields =
    turn.clinical_state !== undefined ||
    turn.hypotheses !== undefined ||
    turn.cant_miss !== undefined ||
    turn.emergency_probability !== undefined ||
    turn.next_action !== undefined ||
    turn.stop_reason !== undefined ||
    turn.question_rationale !== undefined

  return (
    <li className="relative ps-6" data-testid="backstage-turn">
      <span className="absolute start-1 top-1.5 h-2.5 w-2.5 rounded-full bg-primary-600" />
      <div className="space-y-3 rounded-md border border-line bg-canvas p-3">
        <p className="text-body-strong text-ink-900">{title}</p>

        {turn.question_rationale ? (
          <Field label={BACKSTAGE_QUESTION_RATIONALE}>
            <p>{turn.question_rationale}</p>
          </Field>
        ) : null}

        {turn.reasoning_note ? (
          <Field label={BACKSTAGE_REASONING_NOTE}>
            <p className="ltr text-start">{turn.reasoning_note}</p>
          </Field>
        ) : null}

        {turn.emergency_probability !== undefined ? (
          <Field label={BACKSTAGE_EMERGENCY_PROBABILITY}>
            <span>{faPercent(turn.emergency_probability)}</span>
          </Field>
        ) : null}

        {turn.hypotheses && turn.hypotheses.length > 0 ? (
          <Field label={BACKSTAGE_HYPOTHESES}>
            <HypothesisMiniTable rows={turn.hypotheses} />
          </Field>
        ) : null}

        {turn.cant_miss && turn.cant_miss.length > 0 ? (
          <Field label={BACKSTAGE_CANT_MISS}>
            <CantMissChips rows={turn.cant_miss} />
          </Field>
        ) : null}

        {turn.next_action ? (
          <Field label={BACKSTAGE_NEXT_ACTION}>
            <Badge tone="primary">{NEXT_ACTION_LABELS[turn.next_action]}</Badge>
          </Field>
        ) : null}

        {turn.stop_reason ? (
          <Field label={BACKSTAGE_STOP_REASON}>
            <span>{stopReasonLabel(turn.stop_reason)}</span>
          </Field>
        ) : null}

        {turn.clinical_state ? <ClinicalState state={turn.clinical_state} /> : null}

        {!hasStructuredFields ? (
          <p className="text-caption text-ink-400" data-testid="backstage-empty-turn">
            —
          </p>
        ) : null}
      </div>
    </li>
  )
}

/** UI_SPEC §3.3 — part B. Renders whichever fields each turn happens to contain. */
export function BackstagePanel({ session }: { session: SessionDetail }) {
  const [open, setOpen] = useState(true)
  const turns = session.backstage ?? []
  const messageTextById = new Map(session.messages.map((message) => [message.id, message.text]))

  return (
    <Card data-testid="backstage-panel" className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-h2 text-primary-900">{BACKSTAGE_TITLE}</h2>
        <Button variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? (
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          )}
          {open ? BACKSTAGE_TOGGLE_HIDE : BACKSTAGE_TOGGLE_SHOW}
        </Button>
      </header>

      {open ? (
        turns.length === 0 ? (
          <p className="text-body text-ink-500">—</p>
        ) : (
          <ol className="space-y-4 border-s-2 border-line">
            {turns.map((turn) => (
              <BackstageTurnItem
                key={turn.message_id}
                turn={turn}
                title={messageTextById.get(turn.message_id) ?? turn.message_id}
              />
            ))}
          </ol>
        )
      ) : null}
    </Card>
  )
}
