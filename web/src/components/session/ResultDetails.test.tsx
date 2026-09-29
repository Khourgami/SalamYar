import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createSession, finishSession } from '@/api/endpoints'
import type { TriageLevel } from '@/api/types'
import { TriageBadge } from '@/components/session/TriageBadge'
import { KPI_LABELS } from '@/i18n/labels'
import { EVALUATION_REQUIRED, EVALUATION_SUBMIT } from '@/i18n/uiText'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

const TOKENS: Record<TriageLevel, { bg: string; text: string; border: string }> = {
  EMERGENCY_NOW: { bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-600' },
  URGENT_24H: { bg: 'bg-warning-100', text: 'text-warning-700', border: 'border-warning-600' },
  ROUTINE_DAYS: { bg: 'bg-primary-100', text: 'text-primary-700', border: 'border-primary-600' },
  SELF_CARE: { bg: 'bg-success-100', text: 'text-success-700', border: 'border-success-600' },
  INSUFFICIENT_INFO: { bg: 'bg-neutral-100', text: 'text-neutral-700', border: 'border-ink-400' },
}

describe('TriageBadge §1.2 tokens', () => {
  it.each(Object.keys(TOKENS) as TriageLevel[])('renders %s with its token classes', (level) => {
    render(<TriageBadge level={level} size="lg" />)

    const badge = within(screen.getByTestId('triage-badge')).getByTestId('badge')
    const { bg, text, border } = TOKENS[level]
    expect(badge.className).toContain(bg)
    expect(badge.className).toContain(text)
    expect(badge.className).toContain(border)
  })
})

describe('result card emergency block (DESIGN_SYSTEM §6.4)', () => {
  it('renders an alert with the emergency title and an icon', async () => {
    signInAs('doctor')
    const session = await createSession({ agent_id: 'b-gpt54' })
    await finishSession(session.id)
    renderApp(`/sessions/${session.id}`)

    const card = await screen.findByTestId('result-card')
    const alert = within(card).getByTestId('emergency-alert')

    expect(alert).toHaveAttribute('role', 'alert')
    expect(within(alert).getByText('اورژانسی — همین حالا')).toBeInTheDocument()
    expect(alert.querySelector('svg')).not.toBeNull()
  })
})

describe('backstage hypothesis mini table (UI_SPEC §3.3 B)', () => {
  it('shows name_fa, name_en and a Persian percentage', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const panel = await screen.findByTestId('backstage-panel')
    const table = within(panel).getAllByTestId('backstage-hypotheses')[0]

    expect(within(table).getByText('کوله‌سیستیت حاد')).toBeInTheDocument()
    expect(within(table).getByText('Acute cholecystitis')).toBeInTheDocument()
    expect(within(table).getByText('۳۰٪')).toBeInTheDocument()
  })
})

describe('KPI validation focus (DESIGN_SYSTEM §6.6)', () => {
  it('marks the unrated rating and focuses its first box', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)
    await screen.findByTestId('evaluation-form')

    await user.click(screen.getByRole('button', { name: EVALUATION_SUBMIT }))

    const group = screen.getByRole('group', {
      name: KPI_LABELS.triage_correctness.label,
    })
    await waitFor(() => {
      expect(within(group).getByText(EVALUATION_REQUIRED)).toBeInTheDocument()
    })
    expect(within(group).getByRole('radio', { name: '۱' })).toHaveFocus()
  })
})
