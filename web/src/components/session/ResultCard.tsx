import type {
  AssessmentResult,
  CantMiss,
  Hypothesis,
  ResultCard as ResultCardData,
} from '@/api/types'
import { TriageBadge } from '@/components/session/TriageBadge'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  CANT_MISS_STATUS_LABELS,
  CONFIDENCE_LABELS,
  GUARD_FLAG_LABELS,
  triageLevelLabel,
} from '@/i18n/labels'
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

const TH_CLASS = 'border-b border-line px-2 py-2 text-start text-caption font-semibold text-ink-500'
const TD_CLASS = 'border-b border-line px-2 py-2 align-top'

function DiseaseName({ nameFa, nameEn }: { nameFa: string; nameEn: string }) {
  return (
    <span className="flex flex-col">
      <span>{nameFa}</span>
      <span className="ltr text-caption text-ink-500">{nameEn}</span>
    </span>
  )
}

function FindList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-ink-500">—</span>
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
      <h3 className="text-h3 text-primary-900">{RESULT_DIFFERENTIAL_TITLE}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-body" data-testid="differential-table">
          <thead>
            <tr>
              <th className={TH_CLASS}>{RESULT_DIFFERENTIAL_DISEASE}</th>
              <th className={TH_CLASS}>{RESULT_DIFFERENTIAL_PROBABILITY}</th>
              <th className={TH_CLASS}>{RESULT_DIFFERENTIAL_SUPPORTING}</th>
              <th className={TH_CLASS}>{RESULT_DIFFERENTIAL_AGAINST}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className={TD_CLASS}>
                  <DiseaseName nameFa={row.name_fa} nameEn={row.name_en} />
                </td>
                <td className={`${TD_CLASS} whitespace-nowrap`}>{faPercent(row.probability)}</td>
                <td className={`${TD_CLASS} text-caption text-ink-700`}>
                  <FindList items={row.supporting} />
                </td>
                <td className={`${TD_CLASS} text-caption text-ink-700`}>
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
      <h3 className="text-h3 text-primary-900">{RESULT_CANT_MISS_TITLE}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-body" data-testid="cant-miss-table">
          <thead>
            <tr>
              <th className={TH_CLASS}>{RESULT_DIFFERENTIAL_DISEASE}</th>
              <th className={TH_CLASS}>{RESULT_CANT_MISS_STATUS}</th>
              <th className={TH_CLASS}>{RESULT_CANT_MISS_REASON}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const style = CANT_MISS_STATUS_LABELS[row.status]
              return (
                <tr key={index}>
                  <td className={TD_CLASS}>
                    <DiseaseName nameFa={row.name_fa} nameEn={row.name_en} />
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <span
                      className={`inline-block rounded-pill border px-2.5 py-0.5 text-caption ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className={`${TD_CLASS} text-caption text-ink-700`}>{row.reason}</td>
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
    <dl className="grid gap-3 sm:grid-cols-2">
      {CLINICAL_SUMMARY_ORDER.map((key) => (
        <div key={key} className="rounded-md border border-line bg-canvas p-3">
          <dt className="mb-1 text-caption font-semibold text-ink-500">
            {CLINICAL_SUMMARY_LABELS[key]}
          </dt>
          <dd className="whitespace-pre-wrap text-body text-ink-700">{summary[key]}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2">
      <dt className="text-caption text-ink-500">{label}</dt>
      <dd className="text-body-strong text-ink-900">{value}</dd>
    </div>
  )
}

/** DESIGN_SYSTEM §6.4 / UI_SPEC §3.3 — part A: the result card. */
export function ResultCard({ result }: { result: ResultCardData }) {
  const { assessment, guard, stats } = result
  const escalated = guard.actions.includes('safety_floor_escalation')
  const isEmergency = assessment.triage_level === 'EMERGENCY_NOW'

  // §6.4 — the bar colour is purely visual; the number is the meaning.
  const probability = assessment.emergency_probability
  const barClass =
    probability >= 0.2 ? 'bg-danger-600' : probability >= 0.1 ? 'bg-warning-600' : 'bg-primary-600'
  const probabilityPercent = Math.min(100, Math.max(0, probability * 100))

  return (
    <Card data-testid="result-card" className="flex flex-col gap-5">
      <h2 className="text-h2 text-primary-900">{RESULT_TITLE}</h2>

      {isEmergency ? (
        <Alert
          tone="danger"
          role="alert"
          testId="emergency-alert"
          title={<TriageBadge level={assessment.triage_level} size="lg" />}
        >
          {escalated ? (
            <p className="mt-2" data-testid="safety-floor-note">
              {safetyFloorText(triageLevelLabel(guard.raw_triage_level))}
            </p>
          ) : (
            <p className="mt-2">{assessment.patient_message}</p>
          )}
        </Alert>
      ) : (
        <div className="space-y-2">
          <TriageBadge level={assessment.triage_level} size="lg" />
          {escalated ? (
            <Alert tone="warning" testId="safety-floor-note">
              {safetyFloorText(triageLevelLabel(guard.raw_triage_level))}
            </Alert>
          ) : null}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-body">
          <span className="text-ink-700">{RESULT_EMERGENCY_PROBABILITY}</span>
          <span className="font-semibold text-ink-900">{faPercent(probability)}</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-pill bg-neutral-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(probabilityPercent)}
          aria-label={RESULT_EMERGENCY_PROBABILITY}
        >
          <div className={`h-full rounded-pill ${barClass}`} style={{ width: `${probabilityPercent}%` }} />
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-ink-500">{RESULT_SPECIALTY}</dt>
          <dd className="text-body-strong text-ink-900">
            {specialtyLabel(assessment.specialty_primary)}
            {assessment.specialty_secondary
              ? ` ${RESULT_SPECIALTY_SECONDARY} ${specialtyLabel(assessment.specialty_secondary)}`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-500">{RESULT_CONFIDENCE}</dt>
          <dd className="text-body-strong text-ink-900">
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
          <h3 className="text-h3 text-primary-900">{RESULT_MISSING_INFO_TITLE}</h3>
          <ul className="list-disc space-y-1 ps-5 text-body text-ink-700">
            {assessment.missing_information.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ClinicalSummaryBlocks summary={assessment.clinical_summary} />

      {guard.flags.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-h3 text-primary-900">{RESULT_GUARD_FLAGS_TITLE}</h3>
          <ul className="flex flex-wrap gap-2">
            {guard.flags.map((flag) => (
              <li key={flag}>
                <Badge tone="warning">{GUARD_FLAG_LABELS[flag]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-h3 text-primary-900">{RESULT_STATS_TITLE}</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatItem label={RESULT_STATS_QUESTIONS} value={faNumber(stats.questions_asked)} />
          <StatItem label={RESULT_STATS_DURATION} value={faDuration(stats.duration_seconds)} />
          <StatItem label={RESULT_STATS_LATENCY} value={faLatency(stats.mean_turn_latency_ms)} />
          <StatItem label={RESULT_STATS_COST} value={usd(stats.total_cost_usd)} />
        </dl>
      </section>

      {assessment.out_of_scope_pediatric ? (
        <Alert tone="info" testId="pediatric-note">
          {RESULT_PEDIATRIC_NOTE}
        </Alert>
      ) : null}
    </Card>
  )
}
