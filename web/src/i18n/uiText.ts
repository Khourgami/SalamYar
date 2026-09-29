/**
 * Every static Persian string of the UI, verbatim from `docs/UI_SPEC.md` (ZWNJ written as
 * `\u200c` so half-spaces cannot be lost by an editor).
 *
 * A handful of strings have no source in `UI_SPEC.md` (section headings, filter labels, the toast
 * of the agent reload). Those are marked `invented` and recorded as a `W-xxx` decision.
 */

import type { ClinicalSummary, EvaluationComments } from '@/api/types'

/* ------------------------------ shell ------------------------------ */

export const APP_NAME = 'آزمایشگاه پزشک مجازی'

/** §1 — persistent banner, cannot be closed. */
export const BANNER =
  'این محیط آزمایشی است. از اطلاعات بیمار واقعی استفاده نکنید. در شرایط اورژانسی واقعی با ۱۱۵ تماس بگیرید.'

export const NAV_DOCTORS = 'پزشک\u200cها'
export const NAV_HISTORY = 'سوابق من'
export const NAV_DASHBOARD = 'داشبورد'
export const NAV_ALL_SESSIONS = 'همه جلسات'
export const NAV_LOGOUT = 'خروج'

/** §2 — non-admin visitors of `/admin*`. */
export const FORBIDDEN = 'دسترسی ندارید'
export const NOT_FOUND = 'این صفحه پیدا نشد.'

/* ------------------------------ login ------------------------------ */

export const LOGIN_USERNAME = 'نام کاربری'
export const LOGIN_PASSWORD = 'رمز عبور'
export const LOGIN_SUBMIT = 'ورود'
export const LOGIN_ERROR = 'نام کاربری یا رمز عبور اشتباه است'
/** DESIGN_SYSTEM §5.2 — password show/hide toggle accessible names (no UI_SPEC source). */
export const PASSWORD_SHOW = 'نمایش رمز'
export const PASSWORD_HIDE = 'پنهان کردن رمز'
/** DESIGN_SYSTEM §4.2 — mobile drawer menu button accessible name (no UI_SPEC source). */
export const NAV_MENU = 'منو'

/* ------------------------- doctors list ---------------------------- */

export const DOCTORS_TITLE = 'یک پزشک مجازی انتخاب کنید و مثل یک بیمار با او صحبت کنید'
export const DOCTORS_START = 'شروع گفتگو'
export const DOCTORS_HINT =
  'پزشک\u200cها ناشناس هستند. مدل و روش هر پزشک بعد از ثبت ارزیابی نمایش داده می\u200cشود.'
/** §4 — empty doctors list. */
export const DOCTORS_EMPTY = 'در حال حاضر پزشک مجازی فعالی وجود ندارد.'

/* ---------------------------- states ------------------------------- */

/** §4 — network error. */
export const NETWORK_ERROR = 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.'
/** §4 — 409 `TURN_IN_PROGRESS`. */
export const TURN_IN_PROGRESS = 'پیام قبلی هنوز در حال پردازش است.'
export const TRY_AGAIN = 'تلاش دوباره'
export const CONFIRM = 'بله'
export const CANCEL = 'انصراف'

/* ------------------------------ chat ------------------------------- */

export const CHAT_PATIENT_LABEL = 'شما (بیمار)'
export const CHAT_PLACEHOLDER = 'پیام خود را بنویسید…'
export const CHAT_SEND = 'ارسال'
export const CHAT_TYPING = 'پزشک در حال بررسی…'
export const CHAT_FINISH = 'پایان گفتگو و دریافت نتیجه'
export const CHAT_FINISH_CONFIRM = 'گفتگو پایان یابد و پزشک مجازی نتیجه را اعلام کند؟'
export const CHAT_RESEND = 'ارسال دوباره'
export const CHAT_FEEDBACK_NOTE = 'یادداشت'
export const CHAT_FEEDBACK_SAVE = 'ذخیره'
export const CHAT_FEEDBACK_CANCEL = 'بستن'
export const CHAT_FEEDBACK_UP = 'بازخورد مثبت'
export const CHAT_FEEDBACK_DOWN = 'بازخورد منفی'
export const CHAT_QUESTIONS_COUNT = 'تعداد سؤال\u200cها'
/** invented — accessible name of the chat transcript. */
export const CHAT_LOG_LABEL = 'گفتگو'
/** §3.3 — the error bubble keeps the failed text plus its own message. */
export const CHAT_ERROR_TITLE = 'خطا در پاسخ پزشک مجازی'
export const CHAT_READ_ONLY = 'این گفتگو تمام شده است. بازخورد پس از ثبت ارزیابی قابل تغییر نیست.'
/** invented — the note needs a rating because the contract requires one. */
export const CHAT_NOTE_NEEDS_RATING = 'برای ثبت یادداشت ابتدا 👍 یا 👎 را انتخاب کنید'
export const CHAT_FEEDBACK_READ_ONLY = 'بازخورد پس از ثبت ارزیابی قابل تغییر نیست.'

export function questionsCountText(count: string): string {
  return `${CHAT_QUESTIONS_COUNT}: ${count}`
}

/* --------------------------- result card --------------------------- */

export const RESULT_TITLE = 'نتیجه ارزیابی پزشک مجازی'
export const RESULT_EMERGENCY_PROBABILITY = 'احتمال اورژانسی بودن'
export const RESULT_SPECIALTY = 'تخصص پیشنهادی'
export const RESULT_SPECIALTY_SECONDARY = 'و/یا'
export const RESULT_CONFIDENCE = 'میزان اطمینان'
/** `{raw}` is filled with the Persian label of `guard.raw_triage_level`. */
export const RESULT_SAFETY_FLOOR =
  'سطح اولیه پیشنهادی مدل: {raw} — به\u200cدلیل احتمال اورژانس بالا به اورژانسی ارتقا یافت'

export function safetyFloorText(rawLabel: string): string {
  return RESULT_SAFETY_FLOOR.replace('{raw}', rawLabel)
}

export const RESULT_DIFFERENTIAL_TITLE = 'تشخیص\u200cهای افتراقی'
export const RESULT_DIFFERENTIAL_DISEASE = 'بیماری'
export const RESULT_DIFFERENTIAL_PROBABILITY = 'احتمال'
export const RESULT_DIFFERENTIAL_SUPPORTING = 'یافته\u200cهای موافق'
export const RESULT_DIFFERENTIAL_AGAINST = 'یافته\u200cهای مخالف'
export const RESULT_CANT_MISS_TITLE = 'موارد خطرناکی که بررسی شد'
export const RESULT_CANT_MISS_STATUS = 'وضعیت'
export const RESULT_CANT_MISS_REASON = 'دلیل'
export const RESULT_MISSING_INFO_TITLE = 'اطلاعاتی که به دست نیامد'
export const RESULT_GUARD_FLAGS_TITLE = 'هشدارهای ایمنی'
export const RESULT_STATS_TITLE = 'آمار گفتگو'
export const RESULT_STATS_QUESTIONS = 'تعداد سؤال'
export const RESULT_STATS_DURATION = 'مدت گفتگو'
export const RESULT_STATS_LATENCY = 'میانگین زمان پاسخ'
export const RESULT_STATS_COST = 'هزینه (دلار)'
export const RESULT_PEDIATRIC_NOTE = 'بیمار زیر ۱۲ سال — خارج از محدوده ابزار'

/** Persian titles of `ClinicalSummary` blocks, in the order of §3.3 A. */
export const CLINICAL_SUMMARY_LABELS: Record<keyof ClinicalSummary, string> = {
  chief_complaint: 'شکایت اصلی',
  history_of_present_illness: 'شرح حال فعلی',
  relevant_history: 'سوابق مرتبط',
  medications: 'داروها',
  allergies: 'حساسیت\u200cها',
  pertinent_negatives: 'موارد منفی مهم',
  assessment_rationale: 'دلیل ارزیابی',
}

export const CLINICAL_SUMMARY_ORDER: (keyof ClinicalSummary)[] = [
  'chief_complaint',
  'history_of_present_illness',
  'relevant_history',
  'medications',
  'allergies',
  'pertinent_negatives',
  'assessment_rationale',
]

/* ---------------------------- backstage ---------------------------- */

export const BACKSTAGE_TITLE = 'پشت صحنه: استدلال پزشک مجازی'
export const BACKSTAGE_TOGGLE_SHOW = 'نمایش'
export const BACKSTAGE_TOGGLE_HIDE = 'پنهان کردن'
export const BACKSTAGE_QUESTION_RATIONALE = 'چرا این سؤال؟'
export const BACKSTAGE_EMERGENCY_PROBABILITY = 'احتمال اورژانسی'
export const BACKSTAGE_HYPOTHESES = 'فرضیه\u200cها'
export const BACKSTAGE_CANT_MISS = 'موارد خطرناک'
export const BACKSTAGE_NEXT_ACTION = 'اقدام بعدی'
export const BACKSTAGE_STOP_REASON = 'دلیل پایان'
export const BACKSTAGE_CLINICAL_STATE = 'پرونده بالینی'
export const BACKSTAGE_REASONING_NOTE = 'یادداشت استدلال'

/* --------------------------- evaluation ---------------------------- */

export const EVALUATION_TITLE = 'ارزیابی شما'
/** invented — the KPI block has no heading in `UI_SPEC §3.3 C`. */
export const EVALUATION_KPI_TITLE = 'امتیاز شاخص\u200cها (۱ تا ۵)'
export const EVALUATION_UNNECESSARY_QUESTIONS = 'چند سؤال غیرضروری پرسید؟'
export const EVALUATION_SAFETY_TITLE = 'موارد ایمنی (هرکدام رخ داد علامت بزنید)'
export const EVALUATION_VERDICT_TITLE = 'نظر شما به\u200cعنوان پزشک'
export const EVALUATION_VERDICT_TRIAGE = 'سطح تریاژ درست'
export const EVALUATION_VERDICT_SPECIALTY = 'تخصص درست'
export const EVALUATION_VERDICT_DIAGNOSIS = 'تشخیص اصلی از نظر شما'
/** invented — the comments block has no heading in `UI_SPEC §3.3 C`. */
export const EVALUATION_COMMENTS_TITLE = 'توضیحات'
export const EVALUATION_COMPARE_CHECKBOX = 'این گفتگو همان بیمار/سناریوی یک جلسه قبلی بود'
/** invented — the comparison select has no label in `UI_SPEC §3.3 C`. */
export const EVALUATION_COMPARE_SELECT = 'کدام جلسه قبلی؟'
export const EVALUATION_COMPARE_QUESTION = 'کدام بهتر بود؟'
export const EVALUATION_SUBMIT = 'ثبت ارزیابی'
export const EVALUATION_REQUIRED = 'لطفاً این مورد را کامل کنید'
/** §4 — 409 `EVALUATION_LOCKED` on submit. */
export const EVALUATION_LOCKED = 'این جلسه قبلاً ارزیابی شده است.'
export const EVALUATION_ERROR = 'ثبت ارزیابی انجام نشد. دوباره تلاش کنید.'
export const EVALUATION_SCORE_HINT = '۱ = ضعیف، ۵ = عالی'

/** Textarea labels, in the order of §3.3 C.5. */
export const EVALUATION_COMMENT_LABELS: Record<keyof EvaluationComments, string> = {
  strengths: 'نقاط قوت',
  weaknesses: 'نقاط ضعف',
  missed_questions: 'سؤال\u200cهایی که باید پرسیده می\u200cشد',
  general: 'نظر کلی',
}

export const EVALUATION_COMMENT_ORDER: (keyof EvaluationComments)[] = [
  'strengths',
  'weaknesses',
  'missed_questions',
  'general',
]

/* ------------------------------ reveal ----------------------------- */

export const REVEAL_TITLE = 'پشت این پزشک مجازی چه بود؟'
export const REVEAL_ARCHITECTURE = 'معماری'
export const REVEAL_MODEL = 'مدل'
export const REVEAL_CONFIG = 'تنظیمات'
export const REVEAL_MAX_QUESTIONS = 'حداکثر سؤال'
export const REVEAL_SAFETY_FLOOR = 'کف ایمنی'
export const REVEAL_EMERGENCY_THRESHOLD = 'آستانه اورژانس'
export const REVEAL_REASONING_EFFORT = 'سطح استدلال'
export const REVEAL_TEMPERATURE = 'دما (temperature)'
export const REVEAL_PROMPT_VERSION = 'نسخه پرامپت'
export const NEXT_DOCTOR = 'گفتگو با پزشک دیگر'
export const ENABLED = 'فعال'
export const DISABLED = 'غیرفعال'

/* ------------------------------ history ---------------------------- */

export const HISTORY_TITLE = 'سوابق من'
export const HISTORY_TAB_ALL = 'همه'
export const HISTORY_TAB_UNEVALUATED = 'ارزیابی\u200cنشده'
export const HISTORY_COL_DOCTOR = 'پزشک'
export const HISTORY_COL_DATE = 'تاریخ'
export const HISTORY_COL_FIRST_MESSAGE = 'اولین پیام'
export const HISTORY_COL_STATUS = 'وضعیت'
export const HISTORY_COL_RESULT = 'نتیجه'
export const HISTORY_COL_EVALUATED = 'ارزیابی'
export const HISTORY_EVALUATED_YES = 'ثبت شده'
export const HISTORY_EVALUATED_NO = 'ثبت نشده'
export const HISTORY_EMPTY = 'هنوز گفتگویی ثبت نشده است.'
export const HISTORY_NO_FIRST_MESSAGE = '—'

/* ------------------------------- admin ----------------------------- */

export const ADMIN_TITLE = 'داشبورد'
export const ADMIN_GROUP_BY_AGENT = 'بر اساس ایجنت'
export const ADMIN_GROUP_BY_ARCHITECTURE = 'بر اساس معماری'
export const ADMIN_GROUP_BY_MODEL = 'بر اساس مدل'
export const ADMIN_COL_LABEL = 'گروه'
export const ADMIN_COL_ARCHITECTURE = 'معماری'
export const ADMIN_COL_MODEL = 'مدل'
export const ADMIN_COL_SESSIONS = 'جلسات (ارزیابی\u200cشده/کل)'
export const ADMIN_COL_UNDERTRIAGE = 'کم\u200cتریاژ'
export const ADMIN_COL_UNDERTRIAGE_EMERGENCY = 'کم\u200cتریاژ اورژانس'
export const ADMIN_COL_OVERTRIAGE = 'بیش\u200cتریاژ'
export const ADMIN_COL_TRIAGE_EXACT = 'تطابق تریاژ'
export const ADMIN_COL_SPECIALTY_MATCH = 'تطابق تخصص'
export const ADMIN_COL_INSUFFICIENT_INFO = 'اطلاعات ناکافی'
export const ADMIN_COL_SAFETY_FLAGS = 'مجموع موارد ایمنی'
export const ADMIN_COL_MEAN_QUESTIONS = 'میانگین سؤال'
export const ADMIN_COL_LATENCY_P50 = 'زمان پاسخ p50'
export const ADMIN_COL_LATENCY_P90 = 'زمان پاسخ p90'
export const ADMIN_COL_MEAN_COST = 'میانگین هزینه'
export const ADMIN_COL_FEEDBACK = '👍/👎'
export const ADMIN_COL_WINS = 'برد'
export const ADMIN_COL_LOSSES = 'باخت'
export const ADMIN_COL_TIES = 'مساوی'
export const ADMIN_COL_SAFETY_FLOOR = 'ارتقای کف ایمنی'
export const ADMIN_EXPORT = 'دریافت CSV'
export const ADMIN_EXPORTS_TITLE = 'دریافت خروجی CSV'
export const ADMIN_RELOAD = 'بارگذاری مجدد تنظیمات ایجنت\u200cها'
export const ADMIN_METRICS_EMPTY = 'هنوز داده\u200cای برای نمایش وجود ندارد.'

/** `loaded`/`enabled` are already formatted with Persian digits. */
export function adminReloadToast(loaded: string, enabled: string): string {
  return `تنظیمات ایجنت\u200cها بارگذاری شد: ${loaded} ایجنت، ${enabled} فعال.`
}

export const ADMIN_SESSIONS_TITLE = 'همه جلسات'
export const ADMIN_SESSIONS_COL_USER = 'کاربر'
export const ADMIN_SESSIONS_COL_AGENT_ID = 'شناسه ایجنت'
export const ADMIN_SESSIONS_COL_MODEL = 'مدل'
export const ADMIN_SESSIONS_COL_ARCHITECTURE = 'معماری'
export const ADMIN_FILTER_AGENT = 'پزشک مجازی'
export const ADMIN_FILTER_USER = 'کاربر'
export const ADMIN_FILTER_EVALUATED = 'ارزیابی'
export const ADMIN_FILTER_ALL = 'همه'
export const ADMIN_FILTER_YES = 'ثبت شده'
export const ADMIN_FILTER_NO = 'ثبت نشده'

/** CSV table names, as they appear in `API_CONTRACT §7`. */
export const EXPORT_TABLE_LABELS: Record<string, string> = {
  sessions: 'جلسات',
  messages: 'پیام\u200cها',
  evaluations: 'ارزیابی\u200cها',
  feedback: 'بازخورد',
  llm_calls: 'فراخوانی\u200cهای مدل',
  assessments: 'ارزیابی\u200cهای بالینی',
}
