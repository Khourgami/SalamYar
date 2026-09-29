/**
 * TypeScript mirror of `../../docs/API_CONTRACT.md` (v1, frozen).
 *
 * Rule (AGENTS.md): field names and enum values must be **identical** to the contract.
 * Never invent a field or an endpoint here — if something is missing, raise it in
 * `docs/contract-questions.md` and record the assumption as a `W-xxx` decision.
 */

/* ------------------------------------------------------------------ *
 * §2 — Shared types
 * ------------------------------------------------------------------ */

export type Role = 'evaluator' | 'admin'

export type TriageLevel =
  | 'EMERGENCY_NOW'
  | 'URGENT_24H'
  | 'ROUTINE_DAYS'
  | 'SELF_CARE'
  | 'INSUFFICIENT_INFO'

export type Specialty =
  | 'general_practice'
  | 'emergency_medicine'
  | 'internal_medicine'
  | 'cardiology'
  | 'gastroenterology'
  | 'pulmonology'
  | 'neurology'
  | 'infectious_disease'
  | 'nephrology'
  | 'urology'
  | 'obstetrics_gynecology'
  | 'general_surgery'
  | 'orthopedics'
  | 'dermatology'
  | 'ent'
  | 'ophthalmology'
  | 'psychiatry'
  | 'endocrinology'
  | 'rheumatology'
  | 'hematology_oncology'
  | 'pediatrics'

export type SessionStatus = 'active' | 'completed'

export type EndReason = 'agent_concluded' | 'max_questions' | 'evaluator_ended'

export type Architecture = 'simple' | 'structured'

export type Confidence = 'low' | 'medium' | 'high'

export type CantMissStatus = 'not_yet_assessed' | 'ruled_out' | 'not_excluded' | 'suspected'

export type GuardAction = 'safety_floor_escalation'

export type GuardFlag =
  | 'low_prob_emergency'
  | 'high_prob_nonurgent'
  | 'ddx_normalized'
  | 'specialty_invalid'

export type MessageRole = 'agent' | 'patient'

/** `text` = patient message; the rest are agent messages. */
export type MessageKind = 'greeting' | 'question' | 'result' | 'error' | 'text'

export type NextAction = 'ask' | 'clarify' | 'conclude'

export type ComparisonWinner = 'this' | 'other' | 'tie'

export interface User {
  id: string
  username: string
  display_name: string
  role: Role
}

/** Blind view of an agent. `id` is opaque to the UI and never displayed. */
export interface AgentPublic {
  id: string
  display_name: string
  description: string | null
}

/** Only after the evaluation is submitted (or for an admin). */
export interface AgentReveal {
  architecture: Architecture
  model: string
  config: {
    max_questions: number
    safety_floor: boolean
    emergency_threshold: number
    reasoning_effort: string | null
    temperature: number | null
    prompt_version: string
  }
}

export interface Message {
  id: string
  seq: number
  role: MessageRole
  kind: MessageKind
  text: string
  created_at: string
  latency_ms: number | null
}

export interface Hypothesis {
  name_fa: string
  name_en: string
  probability: number
  supporting: string[]
  against: string[]
}

export interface CantMiss {
  name_fa: string
  name_en: string
  status: CantMissStatus
  reason: string
}

export interface ClinicalSummary {
  chief_complaint: string
  history_of_present_illness: string
  relevant_history: string
  medications: string
  allergies: string
  pertinent_negatives: string
  assessment_rationale: string
}

export interface AssessmentResult {
  triage_level: TriageLevel
  emergency_probability: number
  specialty_primary: Specialty
  specialty_secondary: Specialty | null
  differential: Hypothesis[]
  cant_miss: CantMiss[]
  missing_information: string[]
  confidence: Confidence
  out_of_scope_pediatric: boolean
  patient_message: string
  clinical_summary: ClinicalSummary
}

export interface GuardReport {
  raw_triage_level: TriageLevel
  final_triage_level: TriageLevel
  actions: GuardAction[]
  flags: GuardFlag[]
}

export interface ResultCard {
  /** FINAL assessment (after the guard ran). */
  assessment: AssessmentResult
  guard: GuardReport
  stats: {
    questions_asked: number
    /** session created → completed */
    duration_seconds: number
    total_cost_usd: number | null
    mean_turn_latency_ms: number | null
  }
}

/**
 * Per-turn reasoning. Render generically: whichever fields are present.
 * `simple` architecture fills `reasoning_note`; `structured` fills the rest.
 */
export interface BackstageTurn {
  /** The agent message this reasoning produced. */
  message_id: string
  reasoning_note?: string
  clinical_state?: Record<string, unknown>
  hypotheses?: Hypothesis[]
  cant_miss?: CantMiss[]
  emergency_probability?: number
  next_action?: NextAction
  stop_reason?: string | null
  question_rationale?: string
}

export interface Feedback {
  message_id: string
  rating: 'up' | 'down'
  note: string | null
  updated_at: string
}

export interface SessionSummary {
  id: string
  agent: AgentPublic
  status: SessionStatus
  end_reason: EndReason | null
  questions_asked: number
  created_at: string
  completed_at: string | null
  evaluated: boolean
  /** Preview for the history lists. */
  first_patient_message: string | null
  final_triage_level: TriageLevel | null
}

export interface SessionDetail extends SessionSummary {
  messages: Message[]
  /** Present iff completed. */
  result: ResultCard | null
  /** Present iff completed. */
  backstage: BackstageTurn[] | null
  /** Current user's feedback. */
  feedback: Feedback[]
  evaluation: Evaluation | null
  /** Present iff evaluated (or for an admin). */
  reveal: AgentReveal | null
}

/* ------------------------------------------------------------------ *
 * §3 — Auth
 * ------------------------------------------------------------------ */

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

/* ------------------------------------------------------------------ *
 * §5 — Sessions
 * ------------------------------------------------------------------ */

export interface CreateSessionRequest {
  agent_id: string
}

export interface PostMessageRequest {
  text: string
}

export interface TurnResponse {
  /** `null` for `/finish`. */
  patient_message: Message | null
  /** Kind `question` or `result`. */
  agent_message: Message
  /** Full updated session (result/backstage filled when it just completed). */
  session: SessionDetail
}

/* ------------------------------------------------------------------ *
 * §6 — Feedback and evaluation
 * ------------------------------------------------------------------ */

export interface FeedbackInput {
  rating: 'up' | 'down'
  note: string | null
}

export const EVALUATION_SCORE_KEYS = [
  'triage_correctness',
  'referral_appropriateness',
  'efficiency',
  'question_quality',
  'history_completeness',
  'clinical_reasoning',
  'communication',
  'summary_usefulness',
  'overall_trust',
] as const

export type ScoreKey = (typeof EVALUATION_SCORE_KEYS)[number]

export const SAFETY_FLAG_KEYS = [
  'dangerous_undertriage',
  'medication_or_treatment_advice',
  'definitive_diagnosis_claim',
  'medically_incorrect_information',
  'irrelevant_or_inappropriate_content',
] as const

export type SafetyFlagKey = (typeof SAFETY_FLAG_KEYS)[number]

export interface EvaluationScores {
  /** integers 1..5, all required */
  triage_correctness: number
  referral_appropriateness: number
  efficiency: number
  question_quality: number
  history_completeness: number
  clinical_reasoning: number
  communication: number
  summary_usefulness: number
  overall_trust: number
}

export interface SafetyFlags {
  dangerous_undertriage: boolean
  medication_or_treatment_advice: boolean
  definitive_diagnosis_claim: boolean
  medically_incorrect_information: boolean
  irrelevant_or_inappropriate_content: boolean
}

export interface DoctorVerdict {
  triage_level: TriageLevel
  specialty: Specialty
  main_diagnosis: string | null
}

export interface EvaluationComments {
  strengths: string | null
  weaknesses: string | null
  /** "questions it should have asked" */
  missed_questions: string | null
  general: string | null
}

export interface EvaluationComparison {
  /** Must be a completed session of the same user. */
  compared_session_id: string
  winner: ComparisonWinner
}

export interface EvaluationInput {
  /** integers 1..5, all required */
  scores: EvaluationScores
  /** 0..50 */
  unnecessary_questions_count: number | null
  /** booleans, all required */
  safety_flags: SafetyFlags
  doctor_verdict: DoctorVerdict
  comments: EvaluationComments
  comparison: EvaluationComparison | null
}

export type Evaluation = EvaluationInput & {
  id: string
  session_id: string
  created_at: string
}

/* ------------------------------------------------------------------ *
 * §7 — Admin
 * ------------------------------------------------------------------ */

export interface AdminSessionSummary extends SessionSummary {
  user: User
  agent_reveal: AgentReveal
}

export interface MetricsRow {
  /** agent id | architecture | model */
  key: string
  /** display_name or key */
  label: string
  /** null when grouped by model */
  architecture: string | null
  /** null when grouped by architecture */
  model: string | null
  sessions_total: number
  sessions_evaluated: number
  /** 0..1 */
  triage_exact_rate: number | null
  undertriage_rate: number | null
  /** among verdict == EMERGENCY_NOW */
  undertriage_emergency_rate: number | null
  overtriage_rate: number | null
  insufficient_info_count: number
  specialty_match_rate: number | null
  mean_scores: Record<ScoreKey, number | null>
  safety_flag_counts: Record<SafetyFlagKey, number>
  mean_questions: number | null
  turn_latency_p50_ms: number | null
  turn_latency_p90_ms: number | null
  mean_cost_usd: number | null
  feedback_up: number
  feedback_down: number
  pairwise: { wins: number; losses: number; ties: number }
  safety_floor_escalations: number
}

export type MetricsGroupBy = 'agent' | 'architecture' | 'model'

export interface MetricsResponse {
  group_by: MetricsGroupBy
  rows: MetricsRow[]
  generated_at: string
}

export interface ReloadResponse {
  loaded: number
  enabled: number
}

export type ExportTable =
  | 'sessions'
  | 'messages'
  | 'evaluations'
  | 'feedback'
  | 'llm_calls'
  | 'assessments'

/* ------------------------------------------------------------------ *
 * §1 — Errors
 * ------------------------------------------------------------------ */

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

/** 502 `AGENT_ERROR` response body for `POST /sessions/{id}/messages`. */
export interface AgentErrorBody extends ApiErrorBody {
  patient_message: Message
  agent_message: Message
}

/* ------------------------------------------------------------------ *
 * List responses
 * ------------------------------------------------------------------ */

export interface SessionListResponse {
  items: SessionSummary[]
  total: number
}

export interface AdminSessionListResponse {
  items: AdminSessionSummary[]
  total: number
}

/* ------------------------------------------------------------------ *
 * Runtime enum lists (used by the Persian label maps and their tests)
 * ------------------------------------------------------------------ */

export const TRIAGE_LEVELS = [
  'EMERGENCY_NOW',
  'URGENT_24H',
  'ROUTINE_DAYS',
  'SELF_CARE',
  'INSUFFICIENT_INFO',
] as const satisfies readonly TriageLevel[]

export const SPECIALTIES = [
  'general_practice',
  'emergency_medicine',
  'internal_medicine',
  'cardiology',
  'gastroenterology',
  'pulmonology',
  'neurology',
  'infectious_disease',
  'nephrology',
  'urology',
  'obstetrics_gynecology',
  'general_surgery',
  'orthopedics',
  'dermatology',
  'ent',
  'ophthalmology',
  'psychiatry',
  'endocrinology',
  'rheumatology',
  'hematology_oncology',
  'pediatrics',
] as const satisfies readonly Specialty[]

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly Confidence[]

export const CANT_MISS_STATUSES = [
  'not_yet_assessed',
  'ruled_out',
  'not_excluded',
  'suspected',
] as const satisfies readonly CantMissStatus[]

export const GUARD_FLAGS = [
  'low_prob_emergency',
  'high_prob_nonurgent',
  'ddx_normalized',
  'specialty_invalid',
] as const satisfies readonly GuardFlag[]

export const GUARD_ACTIONS = ['safety_floor_escalation'] as const satisfies readonly GuardAction[]

export const END_REASONS = [
  'agent_concluded',
  'max_questions',
  'evaluator_ended',
] as const satisfies readonly EndReason[]

export const ARCHITECTURES = ['simple', 'structured'] as const satisfies readonly Architecture[]

export const SESSION_STATUSES = ['active', 'completed'] as const satisfies readonly SessionStatus[]

export const COMPARISON_WINNERS = ['this', 'other', 'tie'] as const satisfies readonly ComparisonWinner[]

export const EXPORT_TABLES = [
  'sessions',
  'messages',
  'evaluations',
  'feedback',
  'llm_calls',
  'assessments',
] as const satisfies readonly ExportTable[]

export const METRICS_GROUP_BY = ['agent', 'architecture', 'model'] as const satisfies readonly MetricsGroupBy[]
