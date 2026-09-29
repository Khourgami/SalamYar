import type { Evaluation } from '@/api/types'
import { TriageBadge } from '@/components/session/TriageBadge'
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
      className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="evaluation-summary"
    >
      <h2 className="text-base font-bold text-gray-900">{EVALUATION_TITLE}</h2>

      <dl className="grid gap-2 sm:grid-cols-2">
        {KPI_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 rounded border border-gray-200 px-3 py-1.5"
          >
            <dt className="text-sm text-gray-700">{KPI_LABELS[key].label}</dt>
            <dd className="text-sm font-semibold text-gray-900">
              {faNumber(evaluation.scores[key])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="text-sm text-gray-700">
        <span className="text-gray-500">{EVALUATION_UNNECESSARY_QUESTIONS} </span>
        <span className="font-semibold">
          {evaluation.unnecessary_questions_count === null
            ? '—'
            : faNumber(evaluation.unnecessary_questions_count)}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">{EVALUATION_SAFETY_TITLE}</h3>
        {raisedFlags.length === 0 ? (
          <p className="text-sm text-gray-500">—</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {raisedFlags.map((key) => (
              <li
                key={key}
                className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800"
              >
                {SAFETY_FLAG_LABELS[key]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">{EVALUATION_VERDICT_TITLE}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">{EVALUATION_VERDICT_TRIAGE}</dt>
            <dd className="mt-1">
              <TriageBadge level={evaluation.doctor_verdict.triage_level} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{EVALUATION_VERDICT_SPECIALTY}</dt>
            <dd className="text-sm font-medium text-gray-900">
              {specialtyLabel(evaluation.doctor_verdict.specialty)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{EVALUATION_VERDICT_DIAGNOSIS}</dt>
            <dd className="text-sm font-medium text-gray-900">
              {evaluation.doctor_verdict.main_diagnosis ?? '—'}
            </dd>
          </div>
        </dl>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {EVALUATION_COMMENT_ORDER.map((key) => (
          <div key={key} className="rounded border border-gray-200 bg-gray-50 p-3">
            <dt className="mb-1 text-xs font-semibold text-gray-500">
              {EVALUATION_COMMENT_LABELS[key]}
            </dt>
            <dd className="text-sm whitespace-pre-wrap text-gray-800">
              {evaluation.comments[key] ?? '—'}
            </dd>
          </div>
        ))}
      </dl>

      {evaluation.comparison ? (
        <p className="text-sm text-gray-700" data-testid="evaluation-comparison">
          {COMPARISON_WINNER_LABELS[evaluation.comparison.winner]}
        </p>
      ) : null}
    </section>
  )
}
