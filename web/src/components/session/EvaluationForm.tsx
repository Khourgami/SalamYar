import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { isApiError } from '@/api/client'
import { listSessions, submitEvaluation } from '@/api/endpoints'
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
import {
  COMPARISON_WINNER_LABELS,
  KPI_ANCHOR_VALUES,
  KPI_KEYS,
  KPI_LABELS,
  KPI_SCORE_VALUES,
  SAFETY_FLAG_KEYS_ORDER,
  SAFETY_FLAG_LABELS,
  TRIAGE_LEVEL_LABELS,
  TRIAGE_LEVEL_ORDER,
} from '@/i18n/labels'
import { SPECIALTIES } from '@/api/types'
import { SPECIALTY_LABELS } from '@/i18n/specialties'
import { faDateTime, faNumber, truncate } from '@/lib/format'
import { InlineSpinner } from '@/components/States'
import { sessionQueryKey } from '@/components/session/sessionCache'
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

function scrollToField(fieldId: string): void {
  const node = document.getElementById(fieldId)
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'center' })
  }
}

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

export interface EvaluationFormProps {
  session: SessionDetail
}

/** UI_SPEC §3.3 — part C: the evaluation form with hand-written validation. */
export function EvaluationForm({ session }: EvaluationFormProps) {
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
      scrollToField(`field-${firstInvalid}`)
      return
    }

    const unnecessaryCount = unnecessary.trim() === '' ? null : Number(unnecessary)
    const payload: EvaluationInput = {
      scores: Object.fromEntries(
        KPI_KEYS.map((key) => [key, scores[key]]),
      ) as unknown as EvaluationInput['scores'],
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
        compareOn && comparedId !== ''
          ? { compared_session_id: comparedId, winner }
          : null,
    }

    mutation.mutate(payload)
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="evaluation-form"
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-base font-bold text-gray-900">{EVALUATION_TITLE}</h2>

      {mutation.isError &&
      !(isApiError(mutation.error) && mutation.error.status === 409) ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {EVALUATION_ERROR}
        </p>
      ) : null}

      {/* 1. KPI scores */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-800">
          {EVALUATION_KPI_TITLE} <span className="font-normal text-gray-400">{EVALUATION_SCORE_HINT}</span>
        </legend>

        {KPI_KEYS.map((key) => (
          <fieldset
            key={key}
            id={`field-${key}`}
            className="rounded border border-gray-200 p-3"
            aria-invalid={errors[key] ? true : undefined}
          >
            <legend className="px-1 text-sm font-medium text-gray-800">{KPI_LABELS[key].label}</legend>
            <div className="flex flex-wrap items-center gap-3">
              {KPI_SCORE_VALUES.map((value) => (
                <label key={value} className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`kpi-${key}`}
                    value={value}
                    checked={scores[key] === value}
                    onChange={() => {
                      setScores((current) => ({ ...current, [key]: value }))
                      setErrors((current) => ({ ...current, [key]: false }))
                    }}
                  />
                  <span>{faNumber(value)}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
              <span>{KPI_LABELS[key].anchors[KPI_ANCHOR_VALUES[0]]}</span>
              <span className="text-center">{KPI_LABELS[key].anchors[KPI_ANCHOR_VALUES[1]]}</span>
              <span className="text-end">{KPI_LABELS[key].anchors[KPI_ANCHOR_VALUES[2]]}</span>
            </div>
            {errors[key] ? (
              <p className="mt-2 text-xs font-medium text-red-600">{EVALUATION_REQUIRED}</p>
            ) : null}
          </fieldset>
        ))}
      </fieldset>

      {/* 2. Unnecessary questions */}
      <div className="max-w-xs">
        <label htmlFor="unnecessary-questions" className="mb-1 block text-sm font-medium text-gray-700">
          {EVALUATION_UNNECESSARY_QUESTIONS}
        </label>
        <input
          id="unnecessary-questions"
          type="number"
          min={0}
          max={50}
          value={unnecessary}
          onChange={(event) => setUnnecessary(event.target.value)}
          className={inputClass}
        />
      </div>

      {/* 3. Safety flags */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-800">{EVALUATION_SAFETY_TITLE}</legend>
        {SAFETY_FLAG_KEYS_ORDER.map((key) => (
          <label key={key} className="flex items-start gap-2 text-sm text-gray-800">
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
        <legend className="text-sm font-semibold text-gray-800">{EVALUATION_VERDICT_TITLE}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div id="field-triage_level">
            <label htmlFor="verdict-triage" className="mb-1 block text-sm font-medium text-gray-700">
              {EVALUATION_VERDICT_TRIAGE}
            </label>
            <select
              id="verdict-triage"
              value={triage}
              aria-invalid={errors.triage_level ? true : undefined}
              onChange={(event) => {
                setTriage(event.target.value as TriageLevel | '')
                setErrors((current) => ({ ...current, triage_level: false }))
              }}
              className={inputClass}
            >
              <option value="">—</option>
              {TRIAGE_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {TRIAGE_LEVEL_LABELS[level].label}
                </option>
              ))}
            </select>
            {errors.triage_level ? (
              <p className="mt-1 text-xs font-medium text-red-600">{EVALUATION_REQUIRED}</p>
            ) : null}
          </div>

          <div id="field-specialty">
            <label htmlFor="verdict-specialty" className="mb-1 block text-sm font-medium text-gray-700">
              {EVALUATION_VERDICT_SPECIALTY}
            </label>
            <select
              id="verdict-specialty"
              value={specialty}
              aria-invalid={errors.specialty ? true : undefined}
              onChange={(event) => {
                setSpecialty(event.target.value as Specialty | '')
                setErrors((current) => ({ ...current, specialty: false }))
              }}
              className={inputClass}
            >
              <option value="">—</option>
              {SPECIALTIES.map((code) => (
                <option key={code} value={code}>
                  {SPECIALTY_LABELS[code]}
                </option>
              ))}
            </select>
            {errors.specialty ? (
              <p className="mt-1 text-xs font-medium text-red-600">{EVALUATION_REQUIRED}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label
            htmlFor="verdict-diagnosis"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {EVALUATION_VERDICT_DIAGNOSIS}
          </label>
          <input
            id="verdict-diagnosis"
            type="text"
            value={diagnosis}
            onChange={(event) => setDiagnosis(event.target.value)}
            className={inputClass}
          />
        </div>
      </fieldset>

      {/* 5. Comments */}
      <fieldset className="space-y-3">
        {EVALUATION_COMMENT_ORDER.map((key) => (
          <div key={key}>
            <label htmlFor={`comment-${key}`} className="mb-1 block text-sm font-medium text-gray-700">
              {EVALUATION_COMMENT_LABELS[key]}
            </label>
            <textarea
              id={`comment-${key}`}
              rows={3}
              value={comments[key]}
              onChange={(event) =>
                setComments((current) => ({ ...current, [key]: event.target.value }))
              }
              className={inputClass}
            />
          </div>
        ))}
      </fieldset>

      {/* 6. Comparison */}
      <fieldset className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={compareOn}
            onChange={(event) => setCompareOn(event.target.checked)}
            className="mt-1"
          />
          <span>{EVALUATION_COMPARE_CHECKBOX}</span>
        </label>

        {compareOn ? (
          <div className="space-y-3 border-s-2 border-gray-200 ps-3">
            <div>
              <label htmlFor="comparison-session" className="mb-1 block text-sm font-medium text-gray-700">
                {EVALUATION_COMPARE_SELECT}
              </label>
              <select
                id="comparison-session"
                value={comparedId}
                onChange={(event) => setComparedId(event.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {candidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.agent.display_name} — {truncate(item.first_patient_message, 40)} —{' '}
                    {faDateTime(item.created_at, { dateOnly: true })}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-medium text-gray-700">
                {EVALUATION_COMPARE_QUESTION}
              </legend>
              <div className="flex flex-wrap gap-4">
                {(['this', 'other', 'tie'] as const).map((option) => (
                  <label key={option} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="comparison-winner"
                      value={option}
                      checked={winner === option}
                      onChange={() => setWinner(option)}
                    />
                    <span>{COMPARISON_WINNER_LABELS[option]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="inline-flex items-center gap-2 rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-gray-300"
      >
        {mutation.isPending ? <InlineSpinner /> : null}
        {EVALUATION_SUBMIT}
      </button>
    </form>
  )
}
