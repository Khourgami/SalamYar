/**
 * Static seed data for the MSW mocks.
 *
 * Persian strings marked with `\u200c` (ZWNJ) are copied verbatim from
 * `../../backend/docs/AGENT_SPEC.md §2.3` and `docs/UI_SPEC.md`; the escape keeps the
 * half-space visible in source so it cannot be lost by an editor.
 */

import type { AgentPublic, AgentReveal, Architecture, User } from '@/api/types'

/* ------------------------------- users ----------------------------- */

export interface MockUserRecord extends User {
  password: string
}

export const MOCK_USERS: MockUserRecord[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    username: 'doctor',
    password: 'doctor123',
    display_name: 'دکتر آزمایشی',
    role: 'evaluator',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    username: 'admin',
    password: 'admin123',
    display_name: 'مدیر',
    role: 'admin',
  },
]

export function publicUser(user: MockUserRecord): User {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
  }
}

export const MOCK_TOKEN_PREFIX = 'mock-token-'

export function mockToken(username: string): string {
  return `${MOCK_TOKEN_PREFIX}${username}`
}

export function usernameFromToken(token: string): string | null {
  if (!token.startsWith(MOCK_TOKEN_PREFIX)) return null
  const username = token.slice(MOCK_TOKEN_PREFIX.length)
  return username.length > 0 ? username : null
}

/* ------------------------------- agents ---------------------------- */

interface MockAgentSeed {
  id: string
  display_name: string
  architecture: Architecture
  model: string
}

/** Blind agents: architecture and model live only in the reveal. */
export const MOCK_AGENT_SEEDS: MockAgentSeed[] = [
  { id: 'b-gemini3flash', display_name: 'دکتر ۱', architecture: 'structured', model: 'google/gemini-3-flash' },
  { id: 'a-sonnet5', display_name: 'دکتر ۲', architecture: 'simple', model: 'anthropic/claude-sonnet-5' },
  { id: 'b-gpt54', display_name: 'دکتر ۳', architecture: 'structured', model: 'openai/gpt-5.4' },
  { id: 'b-deepseekv4pro', display_name: 'دکتر ۴', architecture: 'structured', model: 'deepseek/deepseek-v4-pro' },
  { id: 'a-gpt54', display_name: 'دکتر ۵', architecture: 'simple', model: 'openai/gpt-5.4' },
  { id: 'b-sonnet5', display_name: 'دکتر ۶', architecture: 'structured', model: 'anthropic/claude-sonnet-5' },
  { id: 'b-gpt5mini', display_name: 'دکتر ۷', architecture: 'structured', model: 'openai/gpt-5-mini' },
  { id: 'b-gemini31pro', display_name: 'دکتر ۸', architecture: 'structured', model: 'google/gemini-3.1-pro' },
]

export const MOCK_AGENTS: AgentPublic[] = MOCK_AGENT_SEEDS.map((seed) => ({
  id: seed.id,
  display_name: seed.display_name,
  description: null,
}))

export const MOCK_AGENT_REVEALS: Record<string, AgentReveal> = Object.fromEntries(
  MOCK_AGENT_SEEDS.map((seed) => [
    seed.id,
    {
      architecture: seed.architecture,
      model: seed.model,
      config: {
        max_questions: 12,
        safety_floor: true,
        emergency_threshold: 0.2,
        reasoning_effort: 'low',
        temperature: 0.3,
        prompt_version: 'v1',
      },
    } satisfies AgentReveal,
  ]),
)

export function mockAgentById(agentId: string): AgentPublic | null {
  return MOCK_AGENTS.find((agent) => agent.id === agentId) ?? null
}

export function mockRevealFor(agentId: string): AgentReveal {
  return (
    MOCK_AGENT_REVEALS[agentId] ?? {
      architecture: 'structured',
      model: 'unknown/model',
      config: {
        max_questions: 12,
        safety_floor: true,
        emergency_threshold: 0.2,
        reasoning_effort: null,
        temperature: null,
        prompt_version: 'v1',
      },
    }
  )
}

/** `b-` = structured (architecture B), `a-` = simple (architecture A). */
export function isStructuredAgent(agentId: string): boolean {
  return mockRevealFor(agentId).architecture === 'structured'
}

/* --------------------------- fixed texts --------------------------- */

/** `AGENT_SPEC.md §2.3` — `GREETING_FA`. */
export const GREETING_FA =
  'سلام، وقت\u200cتون بخیر. من پزشک مجازی تریاژ هستم. لطفاً بفرمایید چه مشکلی دارید و از کی شروع شده؟'

/** `AGENT_SPEC.md §2.3` — `EMERGENCY_TEMPLATE_FA`. */
export const EMERGENCY_TEMPLATE_FA =
  'با توجه به علائمی که گفتید، ممکن است وضعیت شما اورژانسی باشد. لطفاً همین حالا با اورژانس ۱۱۵ تماس بگیرید یا به نزدیک\u200cترین اورژانس بروید. اگر تنها هستید، از یک نفر کمک بخواهید.'

/** `AGENT_SPEC.md §2.3` — `DISCLAIMER_FA`. */
export const DISCLAIMER_FA =
  'این پیام جایگزین معاینه پزشک نیست. اگر حالتان بدتر شد یا علامت جدیدی پیدا کردید، فوراً به پزشک یا اورژانس مراجعه کنید.'

/** `AGENT_SPEC.md §2.3` — `ERROR_FA`. */
export const ERROR_FA =
  'متأسفانه در پردازش پیام مشکلی پیش آمد. لطفاً پیام خود را دوباره ارسال کنید.'

/** Trigger word that makes the mock return the 502 `AGENT_ERROR` body. */
export const MOCK_ERROR_TRIGGER = 'خطا'

/** The rotating follow-up questions of the mock conversation (4 of them). */
export const MOCK_FOLLOW_UP_QUESTIONS = [
  'از چه زمانی شروع شد و ناگهانی بود یا کم\u200cکم آمد؟',
  'درد را از ۱ تا ۱۰ چند می\u200cدانید؟',
  'درد دقیقاً کجاست و به جاهای دیگر می\u200cزند؟',
  'آیا تهوع، استفراغ یا تب هم دارید؟',
]

/** The 5th patient message makes the mock agent conclude with a full result card. */
export const MOCK_CONCLUSION_AFTER_PATIENT_MESSAGES = 5

/* ----------------------------- timing ------------------------------ */

let turnDelayMinMs = 3_000
let turnDelayMaxMs = 6_000

export function mockTurnDelayMs(): number {
  if (turnDelayMaxMs <= turnDelayMinMs) return turnDelayMinMs
  return turnDelayMinMs + Math.random() * (turnDelayMaxMs - turnDelayMinMs)
}

/** Use `0` in tests so the mock conversation answers instantly. */
export function setMockTurnDelayMs(min: number, max: number = min): void {
  turnDelayMinMs = min
  turnDelayMaxMs = max
}

/* ------------------------------ misc ------------------------------- */

export function nowIso(): string {
  return new Date().toISOString()
}

let idCounter = 0

export function newId(): string {
  idCounter += 1
  const cryptoObject = globalThis.crypto as Crypto | undefined
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }
  return `mock-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`
}
