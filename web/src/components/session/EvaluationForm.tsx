import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { isApiError } from '@/api/client'
import { listSessions, submitEvaluation } from '@/api/endpoints'
import { SPECIALTIES } from '@/api/types'
import type {
  ComparisonWinner,
  EvaluationComments,
  EvaluationInput,
  SafetyFlagKey,
  ScoreKey,
  SessionDetail,
  Specialty,
  TriageLevel,
} from '@/api/types'
import { sessionQueryKey } from '@/components/session/sessionCache'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SegmentedRating } from '@/components/ui/SegmentedRating'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'
import { TextField } from '@/components/ui/TextField'
import {
  COMPARISON_WINNER_LABELS,
  KPI_KEYS,
  KPI_LABELS,
  SAFETY_FLAG_KEYS_ORDER,
  SAFETY_FLAG_LABELS,
  TRIAGE_LEVEL_LABELS,
  TRIAGE_LEVEL_ORDER,
} from '@/i18n/labels'
import { SPECIALTY_LABELS } from '@/i18n/specialties'
import {
  EVALUATION_COMMENT_LABELS,
  EVALUATION_COMMENT_ORDER,
  EVALUATION_COMPARE_CHECKBOX,
  EVALUATION_COMPARE_QUESTION,
  EVALUATION_COMPARE_SELECT,
  EVALUATION_ERROR,
  EVALUATION_KPI_TITLE,
  EVALUATION_REQUIRED,
  EVALUATION_SAFETY_TITLE,
  EVALUATION_SCORE_HINT,
  EVALUATION_SUBMIT,
  EVALUATION_TITLE,
  EVALUATION_UNNECESSARY_QUESTIONS,
  EVALUATION_VERDICT_DIAGNOSIS,
  EVALUATION_VERDICT_SPECIALTY,
  EVALUATION_VERDICT_TRIAGE,
  EVALUATION_VERDICT_TITLE,
} from '@/i18n/uiText'
import { faDateTime, truncate } from '@/lib/format'

type FieldKey = ScoreKey | 'triage_level' | 'specialty'

function emptyComments(): Record<keyof EvaluationComments, string> {
  return { strengths: '', weaknesses: '', missed_questions: '', general: '' }
}

function emptyFlags(): Record<SafetyFlagKey, boolean> {
  return {
    dangerous_undertriage: false,
    medication_or_treatment_advice: false,
    definitive_diagnosis_claim: false,
    medically_incorrect_information: false,
    irrelevant_or_inappropriate_content: false,
  }
}

function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Bring the first invalid field into view **and** focus it (DESIGN_SYSTEM §6.6). */
function focusField(fieldId: string): void {
  const node = document.getElementById(fieldId)
  if (!node) return
  if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' })
  const focusable = node.querySelector<HTMLElement>(
    'select, input[type="radio"], input[type="text"], textarea, button',
  )
  focusable?.focus()
}

export interface EvaluationFormProps {
  session: SessionDetail
  /** Called on 409 `EVALUATION_LOCKED`; the parent shows the §4 toast (it outlives the form). */
  onEvaluationLocked?: () => void
}

/** UI_SPEC §3.3 — part C: the evaluation form with hand-written validation. */
export function EvaluationForm({ session, onEvaluationLocked }: EvaluationFormProps) {
  const queryClient = useQueryClient()

  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>({})
  const [unnecessary, setUnnecessary] = useState('')
  const [flags, setFlags] = useState<Record<SafetyFlagKey, boolean>>(emptyFlags)
  const [triage, setTriage] = useState<TriageLevel | ''>('')
  const [specialty, setSpecialty] = useState<Specialty | ''>('')
  const [diagnosis, setDiagnosis] = useState('')
  const [comments, setComments] = useState<Record<keyof EvaluationComments, string>>(emptyComments)
  const [compareOn, setCompareOn] = useState(false)
  const [comparedId, setComparedId] = useState('')
  const [winner, setWinner] = useState<ComparisonWinner>('this')
  const [errors, setErrors] = useState<Partial<Record<FieldKey, boolean>>>({})

  const comparisonQuery = useQuery({
    queryKey: ['sessions', { status: 'completed' }],
    queryFn: () => listSessions({ status: 'completed' }),
    enabled: compareOn,
  })

  const candidates = useMemo(
    () => (comparisonQuery.data?.items ?? []).filter((item) => item.id !== session.id),
    [comparisonQuery.data, session.id],
  )

  const mutation = useMutation({
    mutationFn: (input: EvaluationInput) => submitEvaluation(session.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey(session.id) })
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (error: unknown) => {
      // a stale page (already evaluated / not completed) simply reloads the session
      if (isApiError(error) && error.code === 'EVALUATION_LOCKED') {
        onEvaluationLocked?.()
      }
      if (isApiError(error) && (error.status === 409 || error.status === 400)) {
        void queryClient.invalidateQueries({ queryKey: sessionQueryKey(session.id) })
      }
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return

    const nextErrors: Partial<Record<FieldKey, boolean>> = {}
    for (const key of KPI_KEYS) {
      if (typeof scores[key] !== 'number') nextErrors[key] = true
    }
    if (triage === '') nextErrors.triage_level = true
    if (specialty === '') nextErrors.specialty = true
    setErrors(nextErrors)

    const firstInvalid = [...KPI_KEYS, 'triage_level', 'specialty'].find(
      (key) => nextErrors[key as FieldKey],
    )
    if (firstInvalid) {
      focusField(`field-${firstInvalid}`)
      return
    }

    const unnecessaryCount = unnecessary.trim() === '' ? null : Number(unnecessary)
    const payload: EvaluationInput = {
      scores: Object.fromEntries(KPI_KEYS.map((key) => [key, scores[key]])) as unknown as EvaluationInput['scores'],
      unnecessary_questions_count:
        unnecessaryCount === null || Number.isFinite(unnecessaryCount) ? unnecessaryCount : null,
      safety_flags: flags,
      doctor_verdict: {
        triage_level: triage as TriageLevel,
        specialty: specialty as Specialty,
        main_diagnosis: nullable(diagnosis),
      },
      comments: {
        strengths: nullable(comments.strengths),
        weaknesses: nullable(comments.weaknesses),
        missed_questions: nullable(comments.missed_questions),
        general: nullable(comments.general),
      },
      comparison:
        compareOn && comparedId !== '' ? { compared_session_id: comparedId, winner } : null,
    }

    mutation.mutate(payload)
  }

  return (
    <Card data-testid="evaluation-form">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <h2 className="text-h2 text-primary-900">{EVALUATION_TITLE}</h2>

        {mutation.isError &&
        !(isApiError(mutation.error) && mutation.error.status === 409) ? (
          <Alert tone="danger" role="alert">
            {EVALUATION_ERROR}
          </Alert>
        ) : null}

        {/* 1. KPI scores */}
        <section className="flex flex-col gap-4">
          <h3 className="text-h3 text-primary-900">
            {EVALUATION_KPI_TITLE}{' '}
            <span className="text-caption font-normal text-ink-500">{EVALUATION_SCORE_HINT}</span>
          </h3>

          <div className="grid gap-4 lg:grid-cols-2">
            {KPI_KEYS.map((key) => (
              <SegmentedRating
                key={key}
                id={`field-${key}`}
                name={`kpi-${key}`}
                label={KPI_LABELS[key].label}
                anchors={KPI_LABELS[key].anchors}
                value={scores[key] ?? null}
                error={errors[key] ? EVALUATION_REQUIRED : null}
                onChange={(value) => {
                  setScores((current) => ({ ...current, [key]: value }))
                  setErrors((current) => ({ ...current, [key]: false }))
                }}
              />
            ))}
          </div>
        </section>

        {/* 2. Unnecessary questions */}
        <div className="max-w-[160px]">
          <TextField
            id="unnecessary-questions"
            type="number"
            min={0}
            max={50}
            label={EVALUATION_UNNECESSARY_QUESTIONS}
            value={unnecessary}
            onChange={(event) => setUnnecessary(event.target.value)}
          />
        </div>

        {/* 3. Safety flags */}
        <fieldset className="space-y-2 rounded-md border border-warning-600 bg-warning-100 p-3">
          <legend className="px-1 text-h3 text-primary-900">{EVALUATION_SAFETY_TITLE}</legend>
          {SAFETY_FLAG_KEYS_ORDER.map((key) => (
            <label key={key} className="flex items-start gap-2 text-body text-ink-900">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(event) =>
                  setFlags((current) => ({ ...current, [key]: event.target.checked }))
                }
                className="mt-1"
              />
              <span>{SAFETY_FLAG_LABELS[key]}</span>
            </label>
          ))}
        </fieldset>

        {/* 4. Verdict */}
        <fieldset className="space-y-3">
          <legend className="text-h3 text-primary-900">{EVALUATION_VERDICT_TITLE}</legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <div id="field-triage_level">
              <Select
                id="verdict-triage"
                label={EVALUATION_VERDICT_TRIAGE}
                value={triage}
                error={errors.triage_level ? EVALUATION_REQUIRED : null}
                onChange={(event) => {
                  setTriage(event.target.value as TriageLevel | '')
                  setErrors((current) => ({ ...current, triage_level: false }))
                }}
              >
                <option value="">—</option>
                {TRIAGE_LEVEL_ORDER.map((level) => (
                  <option key={level} value={level}>
                    {TRIAGE_LEVEL_LABELS[level].label}
                  </option>
                ))}
              </Select>
            </div>

            <div id="field-specialty">
              <Select
                id="verdict-specialty"
                label={EVALUATION_VERDICT_SPECIALTY}
                value={specialty}
                error={errors.specialty ? EVALUATION_REQUIRED : null}
                onChange={(event) => {
                  setSpecialty(event.target.value as Specialty | '')
                  setErrors((current) => ({ ...current, specialty: false }))
                }}
              >
                <option value="">—</option>
                {SPECIALTIES.map((code) => (
                  <option key={code} value={code}>
                    {SPECIALTY_LABELS[code]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <TextField
            id="verdict-diagnosis"
            label={EVALUATION_VERDICT_DIAGNOSIS}
            value={diagnosis}
            onChange={(event) => setDiagnosis(event.target.value)}
          />
        </fieldset>

        {/* 5. Comments */}
        <fieldset className="grid gap-3 sm:grid-cols-2">
          {EVALUATION_COMMENT_ORDER.map((key) => (
            <TextArea
              key={key}
              id={`comment-${key}`}
              label={EVALUATION_COMMENT_LABELS[key]}
              rows={3}
              value={comments[key]}
              onChange={(event) =>
                setComments((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          ))}
        </fieldset>

        {/* 6. Comparison */}
        <fieldset className="space-y-3">
          <label className="flex items-start gap-2 text-body text-ink-900">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(event) => setCompareOn(event.target.checked)}
              className="mt-1"
            />
            <span>{EVALUATION_COMPARE_CHECKBOX}</span>
          </label>

          {compareOn ? (
            <div className="space-y-3 border-s-2 border-line ps-3">
              <Select
                id="comparison-session"
                label={EVALUATION_COMPARE_SELECT}
                value={comparedId}
                onChange={(event) => setComparedId(event.target.value)}
              >
                <option value="">—</option>
                {candidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.agent.display_name} — {truncate(item.first_patient_message, 40)} —{' '}
                    {faDateTime(item.created_at, { dateOnly: true })}
                  </option>
                ))}
              </Select>

              <div>
                <p className="mb-1 text-body-strong text-ink-700" id="comparison-winner-label">
                  {EVALUATION_COMPARE_QUESTION}
                </p>
                <SegmentedControl
                  label={EVALUATION_COMPARE_QUESTION}
                  options={(['this', 'other', 'tie'] as const).map((option) => ({
                    value: option,
                    label: COMPARISON_WINNER_LABELS[option],
                  }))}
                  value={winner}
                  onChange={setWinner}
                />
              </div>
            </div>
          ) : null}
        </fieldset>

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          loading={mutation.isPending}
        >
          {EVALUATION_SUBMIT}
        </Button>
      </form>
    </Card>
  )
}
