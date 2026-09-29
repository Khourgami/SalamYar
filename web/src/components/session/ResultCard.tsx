import type { AssessmentResult, CantMiss, Hypothesis, ResultCard as ResultCardData } from '@/api/types'
import { CANT_MISS_STATUS_LABELS, CONFIDENCE_LABELS, GUARD_FLAG_LABELS, triageLevelLabel, triageLevelStyle } from '@/i18n/labels'
import { specialtyLabel } from '@/i18n/specialties'
import {
  CLINICAL_SUMMARY_LABELS,
  CLINICAL_SUMMARY_ORDER,
  RESULT_CANT_MISS_REASON,
  RESULT_CANT_MISS_STATUS,
  RESULT_CANT_MISS_TITLE,
  RESULT_CONFIDENCE,
  RESULT_DIFFERENTIAL_AGAINST,
  RESULT_DIFFERENTIAL_DISEASE,
  RESULT_DIFFERENTIAL_PROBABILITY,
  RESULT_DIFFERENTIAL_SUPPORTING,
  RESULT_DIFFERENTIAL_TITLE,
  RESULT_EMERGENCY_PROBABILITY,
  RESULT_GUARD_FLAGS_TITLE,
  RESULT_MISSING_INFO_TITLE,
  RESULT_PEDIATRIC_NOTE,
  RESULT_SPECIALTY,
  RESULT_SPECIALTY_SECONDARY,
  RESULT_STATS_COST,
  RESULT_STATS_DURATION,
  RESULT_STATS_LATENCY,
  RESULT_STATS_QUESTIONS,
  RESULT_STATS_TITLE,
  RESULT_TITLE,
  safetyFloorText,
} from '@/i18n/uiText'
import { faDuration, faLatency, faNumber, faPercent, usd } from '@/lib/format'
import { TriageBadge } from '@/components/session/TriageBadge'

function DiseaseName({ nameFa, nameEn }: { nameFa: string; nameEn: string }) {
  return (
    <span className="flex flex-col">
      <span>{nameFa}</span>
      <span className="ltr text-xs text-gray-400">{nameEn}</span>
    </span>
  )
}

function FindList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-gray-400">—</span>
  return (
    <ul className="list-disc space-y-0.5 ps-4">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

function DifferentialTable({ rows }: { rows: Hypothesis[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-800">{RESULT_DIFFERENTIAL_TITLE}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="differential-table">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_DIFFERENTIAL_DISEASE}
              </th>
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_DIFFERENTIAL_PROBABILITY}
              </th>
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_DIFFERENTIAL_SUPPORTING}
              </th>
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_DIFFERENTIAL_AGAINST}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="align-top">
                <td className="border border-gray-200 px-2 py-2">
                  <DiseaseName nameFa={row.name_fa} nameEn={row.name_en} />
                </td>
                <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">
                  {faPercent(row.probability)}
                </td>
                <td className="border border-gray-200 px-2 py-2 text-xs text-gray-700">
                  <FindList items={row.supporting} />
                </td>
                <td className="border border-gray-200 px-2 py-2 text-xs text-gray-700">
                  <FindList items={row.against} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CantMissTable({ rows }: { rows: CantMiss[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-800">{RESULT_CANT_MISS_TITLE}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm" data-testid="cant-miss-table">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_DIFFERENTIAL_DISEASE}
              </th>
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_CANT_MISS_STATUS}
              </th>
              <th className="border border-gray-200 px-2 py-1.5 text-start font-medium">
                {RESULT_CANT_MISS_REASON}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const style = CANT_MISS_STATUS_LABELS[row.status]
              return (
                <tr key={index} className="align-top">
                  <td className="border border-gray-200 px-2 py-2">
                    <DiseaseName nameFa={row.name_fa} nameEn={row.name_en} />
                  </td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-xs text-gray-700">
                    {row.reason}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ClinicalSummaryBlocks({ summary }: { summary: AssessmentResult['clinical_summary'] }) {
  return (
    <section className="space-y-2">
      <dl className="grid gap-3 sm:grid-cols-2">
        {CLINICAL_SUMMARY_ORDER.map((key) => (
          <div key={key} className="rounded border border-gray-200 bg-gray-50 p-3">
            <dt className="mb-1 text-xs font-semibold text-gray-500">
              {CLINICAL_SUMMARY_LABELS[key]}
            </dt>
            <dd className="text-sm whitespace-pre-wrap text-gray-800">{summary[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  )
}

/** UI_SPEC §3.3 — part A: the result card. */
export function ResultCard({ result }: { result: ResultCardData }) {
  const { assessment, guard, stats } = result
  const escalated = guard.actions.includes('safety_floor_escalation')
  const barClass = triageLevelStyle(assessment.triage_level)?.barClass ?? 'bg-gray-400'
  const probabilityPercent = Math.min(100, Math.max(0, assessment.emergency_probability * 100))

  return (
    <section
      className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="result-card"
    >
      <h2 className="text-base font-bold text-gray-900">{RESULT_TITLE}</h2>

      <div className="space-y-2">
        <TriageBadge level={assessment.triage_level} size="lg" />
        {escalated ? (
          <p
            className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800"
            data-testid="safety-floor-note"
          >
            {safetyFloorText(triageLevelLabel(guard.raw_triage_level))}
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-gray-600">{RESULT_EMERGENCY_PROBABILITY}</span>
          <span className="font-semibold text-gray-900">
            {faPercent(assessment.emergency_probability)}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded bg-gray-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(probabilityPercent)}
          aria-label={RESULT_EMERGENCY_PROBABILITY}
        >
          <div
            className={`h-full rounded ${barClass}`}
            style={{ width: `${probabilityPercent}%` }}
          />
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-gray-500">{RESULT_SPECIALTY}</dt>
          <dd className="text-sm font-medium text-gray-900">
            {specialtyLabel(assessment.specialty_primary)}
            {assessment.specialty_secondary
              ? ` ${RESULT_SPECIALTY_SECONDARY} ${specialtyLabel(assessment.specialty_secondary)}`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">{RESULT_CONFIDENCE}</dt>
          <dd className="text-sm font-medium text-gray-900">
            {CONFIDENCE_LABELS[assessment.confidence]}
          </dd>
        </div>
      </dl>

      {assessment.differential.length > 0 ? (
        <DifferentialTable rows={assessment.differential} />
      ) : null}

      {assessment.cant_miss.length > 0 ? <CantMissTable rows={assessment.cant_miss} /> : null}

      {assessment.missing_information.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">{RESULT_MISSING_INFO_TITLE}</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm text-gray-700">
            {assessment.missing_information.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ClinicalSummaryBlocks summary={assessment.clinical_summary} />

      {guard.flags.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">{RESULT_GUARD_FLAGS_TITLE}</h3>
          <ul className="flex flex-wrap gap-2">
            {guard.flags.map((flag) => (
              <li
                key={flag}
                className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-xs text-yellow-900"
              >
                {GUARD_FLAG_LABELS[flag]}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">{RESULT_STATS_TITLE}</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatItem label={RESULT_STATS_QUESTIONS} value={faNumber(stats.questions_asked)} />
          <StatItem label={RESULT_STATS_DURATION} value={faDuration(stats.duration_seconds)} />
          <StatItem label={RESULT_STATS_LATENCY} value={faLatency(stats.mean_turn_latency_ms)} />
          <StatItem label={RESULT_STATS_COST} value={usd(stats.total_cost_usd)} />
        </dl>
      </section>

      {assessment.out_of_scope_pediatric ? (
        <p
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="pediatric-note"
        >
          {RESULT_PEDIATRIC_NOTE}
        </p>
      ) : null}
    </section>
  )
}
