import type { ReactNode } from 'react'
import { Eye } from 'lucide-react'

import type { AgentReveal } from '@/api/types'
import { ARCHITECTURE_LABELS } from '@/i18n/labels'
import {
  DISABLED,
  ENABLED,
  REVEAL_ARCHITECTURE,
  REVEAL_CONFIG,
  REVEAL_EMERGENCY_THRESHOLD,
  REVEAL_MAX_QUESTIONS,
  REVEAL_MODEL,
  REVEAL_PROMPT_VERSION,
  REVEAL_REASONING_EFFORT,
  REVEAL_SAFETY_FLOOR,
  REVEAL_TEMPERATURE,
  REVEAL_TITLE,
} from '@/i18n/uiText'
import { faNumber } from '@/lib/format'

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{children}</dd>
    </div>
  )
}

/** UI_SPEC §3.3 — «پشت این پزشک مجازی چه بود؟», shown only after the evaluation is submitted. */
export function RevealBox({ reveal }: { reveal: AgentReveal }) {
  const { config } = reveal

  return (
    <section
      className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4"
      data-testid="reveal"
    >
      <h2 className="inline-flex items-center gap-2 text-base font-bold text-indigo-900">
        <Eye aria-hidden="true" className="h-5 w-5" />
        {REVEAL_TITLE}
      </h2>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label={REVEAL_ARCHITECTURE}>{ARCHITECTURE_LABELS[reveal.architecture]}</Item>
        <Item label={REVEAL_MODEL}>
          <span className="ltr inline-block">{reveal.model}</span>
        </Item>
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-indigo-900">{REVEAL_CONFIG}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Item label={REVEAL_MAX_QUESTIONS}>{faNumber(config.max_questions)}</Item>
          <Item label={REVEAL_SAFETY_FLOOR}>{config.safety_floor ? ENABLED : DISABLED}</Item>
          <Item label={REVEAL_EMERGENCY_THRESHOLD}>
            {faNumber(config.emergency_threshold)}
          </Item>
          <Item label={REVEAL_REASONING_EFFORT}>{config.reasoning_effort ?? '—'}</Item>
          <Item label={REVEAL_TEMPERATURE}>
            {config.temperature === null ? '—' : faNumber(config.temperature)}
          </Item>
          <Item label={REVEAL_PROMPT_VERSION}>{config.prompt_version}</Item>
        </dl>
      </div>
    </section>
  )
}
