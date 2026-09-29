import { EVALUATION_SCORE_KEYS, SAFETY_FLAG_KEYS } from '@/api/types'
import type { EvaluationInput } from '@/api/types'

export function emptyScores(): EvaluationInput['scores'] {
  return Object.fromEntries(
    EVALUATION_SCORE_KEYS.map((key) => [key, 0]),
  ) as unknown as EvaluationInput['scores']
}

export function emptySafetyFlags(): EvaluationInput['safety_flags'] {
  return Object.fromEntries(
    SAFETY_FLAG_KEYS.map((key) => [key, false]),
  ) as unknown as EvaluationInput['safety_flags']
}

/** All nine KPI scores filled with `score`. */
export function filledScores(score = 4): EvaluationInput['scores'] {
  return Object.fromEntries(
    EVALUATION_SCORE_KEYS.map((key) => [key, score]),
  ) as unknown as EvaluationInput['scores']
}

/** A complete, contract-valid evaluation payload. */
export function validEvaluationInput(
  overrides: Partial<EvaluationInput> = {},
): EvaluationInput {
  return {
    scores: filledScores(),
    unnecessary_questions_count: 0,
    safety_flags: emptySafetyFlags(),
    doctor_verdict: {
      triage_level: 'URGENT_24H',
      specialty: 'gastroenterology',
      main_diagnosis: 'کوله‌سیستیت حاد',
    },
    comments: {
      strengths: 'هدفمند بود.',
      weaknesses: null,
      missed_questions: null,
      general: null,
    },
    comparison: null,
    ...overrides,
  }
}

/** A fully blank evaluation payload, used as the starting point of form tests. */
export function emptyEvaluationInput(): EvaluationInput {
  return {
    scores: emptyScores(),
    unnecessary_questions_count: null,
    safety_flags: emptySafetyFlags(),
    doctor_verdict: {
      triage_level: 'ROUTINE_DAYS',
      specialty: 'general_practice',
      main_diagnosis: null,
    },
    comments: {
      strengths: null,
      weaknesses: null,
      missed_questions: null,
      general: null,
    },
    comparison: null,
  }
}
