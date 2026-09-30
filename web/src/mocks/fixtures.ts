/**
 * Fixtures for the MSW mocks (`API_CONTRACT.md §9`):
 * - an active session (3 answered turns);
 * - a completed, not-yet-evaluated structured session (abdominal pain, elderly woman) with a full
 *   result card and structured backstage;
 * - an evaluated simple-architecture session with a reveal.
 *
 * All three are pre-loaded for the `doctor` user so the history list and the reveal are visible
 * immediately. Mock data only — never real patient information.
 */

import type {
  AssessmentResult,
  BackstageTurn,
  CantMiss,
  EndReason,
  Evaluation,
  GuardReport,
  Hypothesis,
  ResultCard,
  TriageLevel,
} from '@/api/types'
import type { StoredSession } from '@/mocks/model'
import { appendMessage, countQuestions } from '@/mocks/model'
import {
  DISCLAIMER_FA,
  EMERGENCY_TEMPLATE_FA,
  GREETING_FA,
  MOCK_USERS,
  isStructuredAgent,
  mockAgentById,
} from '@/mocks/data'

const DOCTOR_ID = MOCK_USERS[0].id

/* ------------------------------------------------------------------ *
 * Assessment — abdominal pain in an elderly woman
 * ------------------------------------------------------------------ */

function abdominalPainAssessment(): AssessmentResult {
  return {
    triage_level: 'URGENT_24H',
    emergency_probability: 0.14,
    specialty_primary: 'gastroenterology',
    specialty_secondary: 'internal_medicine',
    differential: [
      {
        name_fa: 'کوله\u200cسیستیت حاد (التهاب کیسه صفرا)',
        name_en: 'Acute cholecystitis',
        probability: 0.35,
        supporting: [
          'درد در ربع فوقانی راست شکم',
          'شروع درد پس از غذای چرب',
          'تهوع همراه با درد',
        ],
        against: ['تب گزارش نشده است', 'یرقان ندارد'],
      },
      {
        name_fa: 'زخم معده یا اثنی\u200cعشر',
        name_en: 'Peptic ulcer disease',
        probability: 0.25,
        supporting: ['درد سوزاننده در ناحیه اپیگاستر', 'ارتباط با معده خالی'],
        against: ['درد شبانه نداشته است', 'مدفوع سیاه نداشته است'],
      },
      {
        name_fa: 'پانکراتیت حاد (التهاب لوزالمعده)',
        name_en: 'Acute pancreatitis',
        probability: 0.15,
        supporting: ['درد مداوم بالای شکم', 'بی\u200cاشتهایی'],
        against: ['درد به پشت نمی\u200cزند', 'مصرف الکل را رد کرد'],
      },
    ],
    cant_miss: [
      {
        name_fa: 'سکته حاد قلبی',
        name_en: 'Acute myocardial infarction',
        status: 'not_excluded',
        reason:
          'در خانم سالمند با دیابت، درد بالای شکم می\u200cتواند تنها نشانه درگیری قلبی باشد؛ نوار قلب لازم است.',
      },
      {
        name_fa: 'دایسکشن آئورت',
        name_en: 'Aortic dissection',
        status: 'ruled_out',
        reason: 'درد ناگهانی و پاره\u200cکننده به پشت گزارش نشد و فشار خون دو طرف تفاوت نداشت.',
      },
      {
        name_fa: 'ایسکمی مزانتریک',
        name_en: 'Mesenteric ischemia',
        status: 'suspected',
        reason: 'شدت درد با یافته\u200cهای معاینه هماهنگ نبود؛ بررسی عروق شکم لازم است.',
      },
    ],
    missing_information: [
      'نتیجه نوار قلب و آنزیم\u200cهای قلبی',
      'درجه حرارت دقیق بدن',
      'سابقه سنگ کیسه صفرا یا سونوگرافی قبلی',
    ],
    confidence: 'medium',
    out_of_scope_pediatric: false,
    patient_message:
      'با توجه به علائم شما بهتر است امروز و حداکثر ظرف ۲۴ ساعت توسط پزشک داخلی یا گوارش معاینه شوید. تا آن زمان از غذای چرب پرهیز کنید و اگر درد شدیدتر شد، تب بالا آمد یا چشم و پوست زرد شد، بدون تأخیر به اورژانس مراجعه کنید.',
    clinical_summary: {
      chief_complaint: 'درد شکم از دیروز',
      history_of_present_illness:
        'خانم ۶۸ ساله با درد بالای شکم که از دیروز شروع شده و به ربع فوقانی راست متمایل است. درد پس از غذای چرب تشدید می\u200cشود، با تهوع همراه است و شدت آن ۷ از ۱۰ است.',
      relevant_history: 'دیابت نوع ۲، فشار خون بالا، سابقه آپاندکتومی.',
      medications: 'متورمین ۵۰۰ میلی\u200cگرم روزی دو بار، لوزارتان ۲۵ میلی\u200cگرم روزی یک بار.',
      allergies: 'حساسیت دارویی گزارش نشده است.',
      pertinent_negatives:
        'تب، استفراغ خونی، مدفوع سیاه، درد قفسه سینه، تنگی نفس و سوزش ادرار رد شد.',
      assessment_rationale:
        'تصویر بالینی با بیماری صفراوی سازگارتر است، اما در این گروه سنی و با سابقه دیابت، علل قلبی تا رد شدن با نوار قلب نباید کنار گذاشته شوند.',
    },
  }
}

/* ------------------------------------------------------------------ *
 * Assessment — sore throat in a young man
 * ------------------------------------------------------------------ */

function soreThroatAssessment(): AssessmentResult {
  return {
    triage_level: 'SELF_CARE',
    emergency_probability: 0.03,
    specialty_primary: 'general_practice',
    specialty_secondary: null,
    differential: [
      {
        name_fa: 'فارنژیت ویروسی',
        name_en: 'Viral pharyngitis',
        probability: 0.6,
        supporting: ['گلو\u200cدرد همراه با آبریزش بینی', 'تب خفیف', 'سرفه خشک'],
        against: ['لوزه\u200cها چرکی به نظر نمی\u200cرسند'],
      },
      {
        name_fa: 'فارنژیت استرپتوکوکی',
        name_en: 'Streptococcal pharyngitis',
        probability: 0.25,
        supporting: ['تب', 'درد هنگام بلع'],
        against: ['سرفه و آبریزش بینی معمولاً ویروسی است'],
      },
    ],
    cant_miss: [
      {
        name_fa: 'آبسه پری\u200cلوزه\u200cای',
        name_en: 'Peritonsillar abscess',
        status: 'ruled_out',
        reason: 'درد یک\u200cطرفه، صدای گرفته و ناتوانی در باز کردن دهان گزارش نشد.',
      },
      {
        name_fa: 'اپی\u200cگلوتیت',
        name_en: 'Epiglottitis',
        status: 'ruled_out',
        reason: 'تنگی نفس، صدای خفه و ترشح بزاق گزارش نشد.',
      },
    ],
    missing_information: ['وضعیت واکسیناسیون', 'سابقه تب روماتیسمی در خانواده'],
    confidence: 'high',
    out_of_scope_pediatric: false,
    patient_message:
      'علائم شما بیشتر با سرماخوردگی و التهاب ویروسی گلو سازگار است. مایعات کافی بنوشید و استراحت کنید. اگر تب بالای ۳۹ درجه، درد یک\u200cطرفه گلو یا سختی در نفس کشیدن پیدا شد، به پزشک مراجعه کنید.',
    clinical_summary: {
      chief_complaint: 'گلو\u200cدرد از دو روز پیش',
      history_of_present_illness:
        'مرد ۲۷ ساله با گلو\u200cدرد دو روزه، تب ۳۸ درجه، آبریزش بینی و سرفه خشک. تغذیه و نوشیدن مایعات بدون مشکل است.',
      relevant_history: 'سالم، بدون بیماری زمینه\u200cای.',
      medications: 'استامینوفن در چند نوبت مصرف کرده است.',
      allergies: 'حساسیت فصلی به گرده گیاهان.',
      pertinent_negatives: 'تنگی نفس، ناتوانی در بلع، درد یک\u200cطرفه و بزاق اضافه رد شد.',
      assessment_rationale:
        'الگوی علائم به نفع عفونت ویروسی است و هیچ نشانه هشداری برای انسداد راه هوایی وجود ندارد.',
    },
  }
}

/* ------------------------------------------------------------------ *
 * Guard
 * ------------------------------------------------------------------ */

/** The agent whose result card shows the safety-floor escalation. */
export const ESCALATED_AGENT_ID = 'b-gpt54'

export function buildGuard(agentId: string, rawLevel: TriageLevel): GuardReport {
  if (agentId === ESCALATED_AGENT_ID) {
    return {
      raw_triage_level: rawLevel,
      final_triage_level: 'EMERGENCY_NOW',
      actions: ['safety_floor_escalation'],
      flags: [],
    }
  }
  return {
    raw_triage_level: rawLevel,
    final_triage_level: rawLevel,
    actions: [],
    flags: ['ddx_normalized'],
  }
}

export interface MockCase {
  assessment: AssessmentResult
  guard: GuardReport
}

/** The case the mock conversation concludes with. */
export function buildAbdominalPainCase(agentId: string): MockCase {
  const assessment = abdominalPainAssessment()
  const escalated = agentId === ESCALATED_AGENT_ID
  const guard = buildGuard(agentId, assessment.triage_level)
  return {
    assessment: {
      ...assessment,
      emergency_probability: escalated ? 0.31 : 0.14,
      triage_level: guard.final_triage_level,
    },
    guard,
  }
}

/* ------------------------------------------------------------------ *
 * Backstage
 * ------------------------------------------------------------------ */

const SIMPLE_REASONING_NOTES = [
  'Leading hypothesis is biliary colic versus peptic ulcer disease; the onset relative to fatty food is the most discriminating question. No red flag so far.',
  'Pain severity and exact location help separate cholecystitis from gastritis. Age and sex were still unknown, which limited the pre-test probability.',
  'Nausea without vomiting and the absence of fever lower the likelihood of cholangitis. Cardiac causes remain unassessed and must be excluded before concluding.',
  'Upper abdominal pain in a woman over 60 with diabetes warrants an ECG; the differential cannot be closed safely without it.',
]

const STRUCTURED_RATIONALES = [
  'Characterising onset separates sudden vascular catastrophes from gradual inflammatory causes; it discriminates aortic dissection / mesenteric ischemia from cholecystitis.',
  'Severity and precise location refine the probability of cholecystitis versus peptic ulcer disease before further questions are spent.',
  'Associated symptoms (fever, vomiting) adjust the probability of cholangitis and pancreatitis, and confirm that peritonism has not developed.',
  'Relevant history, medications and allergies are needed for the referral and to exclude NSAID-driven ulcer disease.',
]

const CANT_MISS_LADDER: { name_fa: string; name_en: string; reason: string }[] = [
  {
    name_fa: 'سکته حاد قلبی',
    name_en: 'Acute myocardial infarction',
    reason: 'درد بالای شکم در فرد مسن می\u200cتواند نشانه درگیری قلبی باشد.',
  },
  {
    name_fa: 'دایسکشن آئورت',
    name_en: 'Aortic dissection',
    reason: 'درد ناگهانی و پاره\u200cکننده تا زمانی که رد نشود باید در فهرست بماند.',
  },
  {
    name_fa: 'ایسکمی مزانتریک',
    name_en: 'Mesenteric ischemia',
    reason: 'شدت درد نامتناسب با معاینه شکم باید بررسی شود.',
  },
  {
    name_fa: 'کوله\u200cسیستیت حاد',
    name_en: 'Acute cholecystitis',
    reason: 'درد و تهوع پس از غذای چرب الگوی شایع بیماری صفراوی است.',
  },
]

const CANT_MISS_STATUS_LADDER = [
  'not_yet_assessed',
  'not_excluded',
  'suspected',
  'ruled_out',
] as const

function backstageHypotheses(turnIndex: number): Hypothesis[] {
  const base = [
    {
      name_fa: 'کوله\u200cسیستیت حاد',
      name_en: 'Acute cholecystitis',
      supporting: ['درد ربع فوقانی راست', 'تهوع', 'ارتباط با غذای چرب'],
      against: ['تب گزارش نشده'],
    },
    {
      name_fa: 'زخم معده یا اثنی\u200cعشر',
      name_en: 'Peptic ulcer disease',
      supporting: ['درد اپیگاستر', 'ارتباط با معده خالی'],
      against: ['درد شبانه نداشته'],
    },
    {
      name_fa: 'پانکراتیت حاد',
      name_en: 'Acute pancreatitis',
      supporting: ['درد مداوم بالای شکم'],
      against: ['درد به پشت نمی\u200cزند'],
    },
  ]
  const probabilities = [
    [0.3, 0.28, 0.14],
    [0.36, 0.24, 0.16],
    [0.38, 0.22, 0.15],
    [0.35, 0.25, 0.15],
  ]
  const row = probabilities[turnIndex] ?? probabilities[probabilities.length - 1]
  return base.map((item, index) => ({ ...item, probability: row[index] ?? 0.1 }))
}

function backstageCantMiss(turnIndex: number): CantMiss[] {
  return CANT_MISS_LADDER.slice(0, Math.min(2 + turnIndex, CANT_MISS_LADDER.length)).map(
    (item, index) => ({
      ...item,
      status: CANT_MISS_STATUS_LADDER[(index + turnIndex) % CANT_MISS_STATUS_LADDER.length],
    }),
  )
}

/**
 * One `BackstageTurn` per agent **turn** — every `question` plus the concluding `result` — aligned
 * through `message_id`, matching the real backend (verified against the dev server, phase-3 T4).
 *
 * Structured agents fill the structured fields; simple agents fill `reasoning_note` only.
 * The frontend renders whichever fields are present.
 */
export function buildBackstage(session: StoredSession): BackstageTurn[] {
  const structured = isStructuredAgent(session.agent_id)
  const seenPatientTexts = session.messages
    .filter((message) => message.role === 'patient')
    .map((message) => message.text)
  const agentTurns = session.messages.filter(
    (message) =>
      message.role === 'agent' && (message.kind === 'question' || message.kind === 'result'),
  )

  let questionIndex = 0
  return agentTurns.map((message) => {
    const closing = message.kind === 'result'
    // The concluding turn reuses the shape of the final question turn.
    const shapeIndex = closing ? Math.max(0, questionIndex - 1) : questionIndex
    const observed = seenPatientTexts.slice(0, closing ? seenPatientTexts.length : questionIndex + 1)
    if (!closing) questionIndex += 1

    if (!structured) {
      return {
        message_id: message.id,
        reasoning_note: closing
          ? SIMPLE_REASONING_NOTES[SIMPLE_REASONING_NOTES.length - 1]
          : SIMPLE_REASONING_NOTES[shapeIndex % SIMPLE_REASONING_NOTES.length],
      } satisfies BackstageTurn
    }

    return {
      message_id: message.id,
      clinical_state: {
        age_years: 68,
        sex: 'female',
        pregnancy_possible: 'not_applicable',
        chief_complaint: 'درد شکم از دیروز',
        symptoms: [
          {
            name: 'درد شکم',
            onset: 'دیروز',
            duration: 'حدود ۲۴ ساعت',
            location: observed.length >= 2 ? 'ربع فوقانی راست' : 'بالای شکم',
            character: 'مداوم و مبهم',
            severity_0_10: observed.length >= 2 ? 7 : null,
            timing_pattern: 'مداوم با تشدید پس از غذا',
            aggravating: observed.length >= 4 ? ['غذای چرب'] : [],
            relieving: [],
          },
        ],
        associated_symptoms: observed.length >= 3 ? ['تهوع'] : [],
        pertinent_negatives: observed.length >= 3 ? ['تب', 'استفراغ خونی'] : [],
        medical_history: observed.length >= 3 ? ['دیابت نوع ۲', 'فشار خون بالا'] : [],
        medications: observed.length >= 4 ? ['متورمین', 'لوزارتان'] : [],
        allergies: [],
        other_relevant: observed,
        contradictions: [],
      },
      hypotheses: backstageHypotheses(shapeIndex),
      cant_miss: backstageCantMiss(shapeIndex),
      emergency_probability: [0.11, 0.14, 0.17, 0.2][shapeIndex] ?? 0.24,
      next_action: closing ? 'conclude' : 'ask',
      stop_reason: closing ? 'enough_information' : null,
      question_rationale: closing
        ? ''
        : STRUCTURED_RATIONALES[shapeIndex % STRUCTURED_RATIONALES.length],
    } satisfies BackstageTurn
  })
}

/* ------------------------------------------------------------------ *
 * Result card + session assembly
 * ------------------------------------------------------------------ */

function meanLatencyMs(session: StoredSession): number | null {
  const latencies = session.messages
    .map((message) => message.latency_ms)
    .filter((value): value is number => typeof value === 'number')
  if (latencies.length === 0) return null
  return Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
}

function buildResultCard(session: StoredSession, mockCase: MockCase): ResultCard {
  const created = Date.parse(session.created_at)
  const completed = Date.parse(session.completed_at ?? session.created_at)
  return {
    assessment: mockCase.assessment,
    guard: mockCase.guard,
    stats: {
      questions_asked: countQuestions(session),
      duration_seconds: Math.max(0, Math.round((completed - created) / 1000)),
      total_cost_usd: 0.0431,
      mean_turn_latency_ms: meanLatencyMs(session),
    },
  }
}

/** The final agent bubble: the emergency template when the safety floor fired, plus the disclaimer. */
export function finalPatientMessageText(mockCase: MockCase): string {
  const escalated = mockCase.guard.actions.includes('safety_floor_escalation')
  const body = escalated ? EMERGENCY_TEMPLATE_FA : mockCase.assessment.patient_message
  return `${body}\n\n${DISCLAIMER_FA}`
}

/**
 * Complete a session: fill `result` and `backstage` and append the `result` message.
 * Shared by the fixtures and by the runtime mock conversation.
 */
export function completeSession(
  session: StoredSession,
  mockCase: MockCase,
  options: { endReason?: EndReason; completedAt?: string; latencyMs?: number | null } = {},
): StoredSession {
  const completedAt = options.completedAt ?? new Date().toISOString()
  session.status = 'completed'
  session.end_reason = options.endReason ?? 'agent_concluded'
  session.completed_at = completedAt
  session.result = buildResultCard(session, mockCase)
  // Append the result message first: the backstage needs its id for the concluding turn, and the
  // real backend emits one BackstageTurn for the result message too.
  appendMessage(session, 'agent', 'result', finalPatientMessageText(mockCase), {
    latencyMs: options.latencyMs ?? 4_800,
    createdAt: completedAt,
  })
  session.backstage = buildBackstage(session)
  return session
}

function newSession(
  id: string,
  agentId: string,
  createdAt: string,
  userId = DOCTOR_ID,
): StoredSession {
  return {
    id,
    user_id: userId,
    agent_id: agentId,
    agent: mockAgentById(agentId) ?? { id: agentId, display_name: 'دکتر ناشناس', description: null },
    status: 'active',
    end_reason: null,
    created_at: createdAt,
    completed_at: null,
    messages: [],
    result: null,
    backstage: null,
    feedback: {},
    evaluation: null,
    turn_in_progress: false,
  }
}

type ScriptLine = [
  role: 'agent' | 'patient',
  kind: 'greeting' | 'question' | 'text',
  text: string,
  latencyMs: number | null,
]

function playScript(session: StoredSession, script: ScriptLine[], stepMs: number): void {
  let cursor = Date.parse(session.created_at)
  for (const [role, kind, text, latencyMs] of script) {
    cursor += stepMs
    appendMessage(session, role, kind, text, {
      latencyMs,
      createdAt: new Date(cursor).toISOString(),
    })
  }
}

const ACTIVE_SESSION_ID = '11111111-1111-4111-8111-111111111111'
const STRUCTURED_SESSION_ID = '22222222-2222-4222-8222-222222222222'
const EVALUATED_SESSION_ID = '33333333-3333-4333-8333-333333333333'

export const FIXTURE_SESSION_IDS = {
  active: ACTIVE_SESSION_ID,
  completedStructured: STRUCTURED_SESSION_ID,
  evaluated: EVALUATED_SESSION_ID,
} as const

/** Evaluation submitted by the doctor on the pre-loaded evaluated session. */
const EVALUATION_FIXTURE: Evaluation = {
  id: '50000000-0000-4000-8000-000000000001',
  session_id: EVALUATED_SESSION_ID,
  created_at: '2026-09-27T14:40:00.000Z',
  scores: {
    triage_correctness: 4,
    referral_appropriateness: 4,
    efficiency: 5,
    question_quality: 4,
    history_completeness: 4,
    clinical_reasoning: 3,
    communication: 5,
    summary_usefulness: 4,
    overall_trust: 4,
  },
  unnecessary_questions_count: 1,
  safety_flags: {
    dangerous_undertriage: false,
    medication_or_treatment_advice: false,
    definitive_diagnosis_claim: false,
    medically_incorrect_information: false,
    irrelevant_or_inappropriate_content: false,
  },
  doctor_verdict: {
    triage_level: 'SELF_CARE',
    specialty: 'general_practice',
    main_diagnosis: 'فارنژیت ویروسی',
  },
  comments: {
    strengths:
      'گفتگو کوتاه و هدفمند بود و سؤال\u200cها بی\u200cهدف نبودند. لحن همدلانه و قابل فهم بود.',
    weaknesses: 'شرح حال مصرف آنتی\u200cبیوتیک و سابقه تب روماتیسمی پرسیده نشد.',
    missed_questions: 'سابقه واکسیناسیون و تماس با فرد بیمار در خانواده.',
    general: 'برای یک مورد ساده عملکرد قابل قبولی داشت.',
  },
  comparison: null,
}

/* ------------------------------------------------------------------ *
 * Seeded sessions
 * ------------------------------------------------------------------ */

function activeSession(): StoredSession {
  const session = newSession(ACTIVE_SESSION_ID, 'b-sonnet5', '2026-09-29T07:30:00.000Z')
  const script: ScriptLine[] = [
    ['agent', 'greeting', GREETING_FA, null],
    [
      'patient',
      'text',
      'سلام. از دیشب دل\u200cدرد شدیدی دارم و حالت تهوع هم دارم.',
      null,
    ],
    ['agent', 'question', 'سلام. از کی این درد شروع شد؟ ناگهانی بود یا کم\u200cکم؟', 5_400],
    ['patient', 'text', 'از دیشب شروع شد و کم\u200cکم بیشتر شد، ناگهانی نبود.', null],
    ['agent', 'question', 'درد را از ۱ تا ۱۰ چند می\u200cدانید؟', 4_900],
    ['patient', 'text', 'حدود ۷ است. بیشتر بالای شکم و کمی سمت راست.', null],
    ['agent', 'question', 'تهوع یا استفراغ هم دارید؟ تب چطور؟', 6_100],
    ['patient', 'text', 'تهوع دارم ولی استفراغ نکردم. تب هم ندارم.', null],
  ]
  playScript(session, script, 20_000)
  return session
}

function completedStructuredSession(): StoredSession {
  const session = newSession(STRUCTURED_SESSION_ID, 'b-gemini31pro', '2026-09-28T09:05:00.000Z')
  const script: ScriptLine[] = [
    ['agent', 'greeting', GREETING_FA, null],
    [
      'patient',
      'text',
      'مادرم ۶۸ ساله است و از دیروز دل\u200cدرد دارد. من همراه او هستم و به جایش جواب می\u200cدهم.',
      null,
    ],
    ['agent', 'question', 'درد از دیروز شروع شد یا زودتر؟ و ناگهانی بود یا کم\u200cکم؟', 5_200],
    ['patient', 'text', 'از دیروز عصر شروع شد و کم\u200cکم سنگین\u200cتر شد. ناگهانی نبود.', null],
    ['agent', 'question', 'درد دقیقاً کجاست و از ۱ تا ۱۰ چند است؟', 4_600],
    ['patient', 'text', 'بالای شکم است و بیشتر سمت راست. حدود ۷ از ۱۰.', null],
    ['agent', 'question', 'آیا تهوع، استفراغ، تب یا زردی چشم و پوست دارد؟', 6_300],
    ['patient', 'text', 'تهوع دارد ولی استفراغ نکرده. تب ندارد و زردی هم ندیده\u200cام.', null],
    ['agent', 'question', 'چه داروهایی مصرف می\u200cکند و سابقه بیماری خاصی دارد؟', 5_800],
    ['patient', 'text', 'داروی دیابت و فشار خون می\u200cخورد: متورمین و لوزارتان.', null],
  ]
  playScript(session, script, 40_000)
  return completeSession(session, buildAbdominalPainCase(session.agent_id), {
    endReason: 'agent_concluded',
    completedAt: '2026-09-28T09:28:00.000Z',
    latencyMs: 5_100,
  })
}

function evaluatedSimpleSession(): StoredSession {
  const session = newSession(EVALUATED_SESSION_ID, 'a-gpt54', '2026-09-27T14:00:00.000Z')
  const script: ScriptLine[] = [
    ['agent', 'greeting', GREETING_FA, null],
    ['patient', 'text', 'دو روز است گلویم درد می\u200cکند و کمی تب دارم.', null],
    ['agent', 'question', 'تب را اندازه گرفتید؟ و آیا سرفه یا آبریزش بینی هم دارید؟', 3_900],
    ['patient', 'text', 'بله ۳۸ بود. سرفه خشک و آبریزش بینی دارم.', null],
    ['agent', 'question', 'بلع غذا سخت شده؟ یک طرف گلو بیشتر درد می\u200cکند؟', 4_100],
    ['patient', 'text', 'نه، بلع سخت نیست و هر دو طرف درد می\u200cکند.', null],
    ['agent', 'question', 'سابقه بیماری خاصی دارید یا دارویی مصرف می\u200cکنید؟', 3_600],
    ['patient', 'text', 'نه، سالم هستم. فقط استامینوفن خورده\u200cام.', null],
  ]
  playScript(session, script, 30_000)

  completeSession(
    session,
    { assessment: soreThroatAssessment(), guard: buildGuard(session.agent_id, 'SELF_CARE') },
    { endReason: 'agent_concluded', completedAt: '2026-09-27T14:12:00.000Z', latencyMs: 3_800 },
  )

  session.evaluation = EVALUATION_FIXTURE
  session.feedback[DOCTOR_ID] = [
    {
      message_id: session.messages[2].id,
      rating: 'up',
      note: 'سؤال\u200cها کوتاه و بدون القا بودند.',
      updated_at: '2026-09-27T14:30:00.000Z',
    },
  ]
  return session
}

/** Fresh copies of the seeded sessions; called by the mock store on reset. */
export function createFixtureSessions(): StoredSession[] {
  return [activeSession(), completedStructuredSession(), evaluatedSimpleSession()]
}
