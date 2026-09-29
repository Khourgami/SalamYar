import type { Evaluation } from '@/api/types'
import { TriageBadge } from '@/components/session/TriageBadge'
import { Badge } from '@/components/ui/Badge'
import {
  COMPARISON_WINNER_LABELS,
  KPI_KEYS,
  KPI_LABELS,
  SAFETY_FLAG_KEYS_ORDER,
  SAFETY_FLAG_LABELS,
} from '@/i18n/labels'
import { specialtyLabel } from '@/i18n/specialties'
import {
  EVALUATION_COMMENT_LABELS,
  EVALUATION_COMMENT_ORDER,
  EVALUATION_SAFETY_TITLE,
  EVALUATION_TITLE,
  EVALUATION_UNNECESSARY_QUESTIONS,
  EVALUATION_VERDICT_DIAGNOSIS,
  EVALUATION_VERDICT_SPECIALTY,
  EVALUATION_VERDICT_TRIAGE,
  EVALUATION_VERDICT_TITLE,
} from '@/i18n/uiText'
import { faNumber } from '@/lib/format'

/** UI_SPEC §3.3 — the submitted answers, read-only, replacing the form. */
export function EvaluationSummary({ evaluation }: { evaluation: Evaluation }) {
  const raisedFlags = SAFETY_FLAG_KEYS_ORDER.filter((key) => evaluation.safety_flags[key])

  return (
    <section
      className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5"
      data-testid="evaluation-summary"
    >
      <h2 className="text-h2 text-primary-900">{EVALUATION_TITLE}</h2>

      <dl className="grid gap-2 sm:grid-cols-2">
        {KPI_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5"
          >
            <dt className="text-body text-ink-700">{KPI_LABELS[key].label}</dt>
            <dd className="text-body-strong text-ink-900">
              {faNumber(evaluation.scores[key])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="text-body text-ink-700">
        <span className="text-ink-500">{EVALUATION_UNNECESSARY_QUESTIONS} </span>
        <span className="font-semibold">
          {evaluation.unnecessary_questions_count === null
            ? '—'
            : faNumber(evaluation.unnecessary_questions_count)}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-h3 text-primary-900">{EVALUATION_SAFETY_TITLE}</h3>
        {raisedFlags.length === 0 ? (
          <p className="text-body text-ink-500">—</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {raisedFlags.map((key) => (
              <li key={key}>
                <Badge tone="danger">{SAFETY_FLAG_LABELS[key]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-h3 text-primary-900">{EVALUATION_VERDICT_TITLE}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-caption text-ink-500">{EVALUATION_VERDICT_TRIAGE}</dt>
            <dd className="mt-1">
              <TriageBadge level={evaluation.doctor_verdict.triage_level} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">{EVALUATION_VERDICT_SPECIALTY}</dt>
            <dd className="text-body-strong text-ink-900">
              {specialtyLabel(evaluation.doctor_verdict.specialty)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">{EVALUATION_VERDICT_DIAGNOSIS}</dt>
            <dd className="text-body-strong text-ink-900">
              {evaluation.doctor_verdict.main_diagnosis ?? '—'}
            </dd>
          </div>
        </dl>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {EVALUATION_COMMENT_ORDER.map((key) => (
          <div key={key} className="rounded-md border border-line bg-canvas p-3">
            <dt className="mb-1 text-caption font-semibold text-ink-500">
              {EVALUATION_COMMENT_LABELS[key]}
            </dt>
            <dd className="whitespace-pre-wrap text-body text-ink-700">
              {evaluation.comments[key] ?? '—'}
            </dd>
          </div>
        ))}
      </dl>

      {evaluation.comparison ? (
        <p className="text-body text-ink-700" data-testid="evaluation-comparison">
          {COMPARISON_WINNER_LABELS[evaluation.comparison.winner]}
        </p>
      ) : null}
    </section>
  )
}
