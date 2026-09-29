import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HttpResponse, http } from 'msw'
import { EVALUATION_SCORE_KEYS, SAFETY_FLAG_KEYS } from '@/api/types'
import type { MetricsRow } from '@/api/types'
import { server } from '@/mocks/server'
import { MOCK_AGENTS } from '@/mocks/data'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { KPI_KEYS, KPI_LABELS } from '@/i18n/labels'
import {
  ADMIN_CHART_CAPTION,
  ADMIN_CHART_TITLE,
  ADMIN_RECENT_TITLE,
  ADMIN_RECENT_VIEW_ALL,
  ADMIN_SUMMARY_EVALUATED,
  ADMIN_SUMMARY_SAFETY_FLOOR,
  ADMIN_SUMMARY_SAFETY_FLAGS,
  ADMIN_SUMMARY_TOTAL_SESSIONS,
} from '@/i18n/uiText'
import {
  CHAT_FEEDBACK_DOWN,
  CHAT_FEEDBACK_UP,
  ADMIN_COL_SESSIONS,
  ADMIN_COL_UNDERTRIAGE,
  ADMIN_EXPORT,
  ADMIN_GROUP_BY_AGENT,
  ADMIN_GROUP_BY_ARCHITECTURE,
  ADMIN_RELOAD,
  ADMIN_SESSIONS_COL_AGENT_ID,
  ADMIN_SESSIONS_COL_MODEL,
  ADMIN_SESSIONS_TITLE,
  ADMIN_TITLE,
  EVALUATION_TITLE,
  EXPORT_TABLE_LABELS,
  FORBIDDEN,
  NEXT_DOCTOR,
  REVEAL_TITLE,
  adminReloadToast,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { stubDownloads } from '@/test/downloads'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

function metricsRow(overrides: Partial<MetricsRow> & { key: string; label: string }): MetricsRow {
  return {
    architecture: null,
    model: null,
    sessions_total: 0,
    sessions_evaluated: 0,
    triage_exact_rate: null,
    undertriage_rate: null,
    undertriage_emergency_rate: null,
    overtriage_rate: null,
    insufficient_info_count: 0,
    specialty_match_rate: null,
    mean_scores: Object.fromEntries(EVALUATION_SCORE_KEYS.map((key) => [key, null])) as MetricsRow['mean_scores'],
    safety_flag_counts: Object.fromEntries(SAFETY_FLAG_KEYS.map((key) => [key, 0])) as MetricsRow['safety_flag_counts'],
    mean_questions: null,
    turn_latency_p50_ms: null,
    turn_latency_p90_ms: null,
    mean_cost_usd: null,
    feedback_up: 0,
    feedback_down: 0,
    pairwise: { wins: 0, losses: 0, ties: 0 },
    safety_floor_escalations: 0,
    ...overrides,
  }
}

async function openDashboard() {
  signInAs('admin')
  renderApp('/admin')
  await screen.findByTestId('metrics-table')
  return screen.getByTestId('metrics-table')
}

describe('admin dashboard', () => {
  it('renders one row per agent with the exact metric columns', async () => {
    const table = await openDashboard()

    expect(screen.getByRole('heading', { name: ADMIN_TITLE })).toBeInTheDocument()
    expect(within(table).getAllByTestId('metrics-row')).toHaveLength(MOCK_AGENTS.length)

    expect(within(table).getByRole('columnheader', { name: ADMIN_COL_SESSIONS })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: ADMIN_COL_UNDERTRIAGE })).toBeInTheDocument()
    for (const key of KPI_KEYS) {
      expect(
        within(table).getByRole('columnheader', { name: KPI_LABELS[key].label }),
      ).toBeInTheDocument()
    }

    const firstRow = within(table).getAllByTestId('metrics-row')[0]
    expect(within(firstRow).getByText('دکتر ۱')).toBeInTheDocument()
    // rates are percentages, scores have one decimal
    expect(within(firstRow).getAllByText(/٪/).length).toBeGreaterThan(0)
    expect(within(firstRow).getAllByText(/٫/).length).toBeGreaterThan(0)
  })

  it('sorts by a column and toggles the direction', async () => {
    const user = userEvent.setup()
    const table = await openDashboard()

    const sessionsHeader = within(table).getByRole('button', { name: ADMIN_COL_SESSIONS })
    expect(sessionsHeader.closest('th')).toHaveAttribute('aria-sort', 'none')

    await user.click(sessionsHeader)
    await waitFor(() => {
      const firstRow = within(table).getAllByTestId('metrics-row')[0]
      // ascending: the fewest sessions is دکتر ۵ (6 total)
      expect(within(firstRow).getByText('دکتر ۵')).toBeInTheDocument()
    })
    expect(sessionsHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending')

    await user.click(sessionsHeader)
    await waitFor(() => {
      const firstRow = within(table).getAllByTestId('metrics-row')[0]
      // descending: the most sessions is دکتر ۴ (10 total)
      expect(within(firstRow).getByText('دکتر ۴')).toBeInTheDocument()
    })
    expect(sessionsHeader.closest('th')).toHaveAttribute('aria-sort', 'descending')
  })

  it('refetches when the group-by switch changes', async () => {
    const user = userEvent.setup()
    const table = await openDashboard()

    expect(screen.getByRole('button', { name: ADMIN_GROUP_BY_AGENT })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: ADMIN_GROUP_BY_ARCHITECTURE }))

    await waitFor(() => {
      expect(within(table).getAllByTestId('metrics-row')).toHaveLength(2)
    })
    // both the label and the architecture column show the group key
    expect(within(table).getAllByText('simple').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('structured').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: ADMIN_GROUP_BY_ARCHITECTURE })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('downloads a CSV named <table>.csv for each export button', async () => {
    const user = userEvent.setup()
    const downloads = stubDownloads()
    await openDashboard()

    const button = screen.getByRole('button', {
      name: `${ADMIN_EXPORT} — ${EXPORT_TABLE_LABELS.sessions}`,
    })
    await user.click(button)

    await waitFor(() => {
      expect(downloads.anchors.some((anchor) => anchor.download === 'sessions.csv')).toBe(true)
    })
    expect(downloads.createObjectURL).toHaveBeenCalledTimes(1)
    expect(downloads.click).toHaveBeenCalledTimes(1)
    expect(downloads.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    expect(
      screen.getByRole('button', { name: `${ADMIN_EXPORT} — ${EXPORT_TABLE_LABELS.llm_calls}` }),
    ).toBeInTheDocument()
  })

  it('reloads the agent config and shows the result in a toast', async () => {
    const user = userEvent.setup()
    await openDashboard()

    await user.click(screen.getByRole('button', { name: ADMIN_RELOAD }))

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      adminReloadToast('۱۲', '۸'),
    )
  })
})

describe('admin dashboard summary, chart and recent sessions (DESIGN_SYSTEM §6.8)', () => {
  const rows = [
    metricsRow({
      key: 'a1',
      label: 'دکتر الف',
      sessions_total: 10,
      sessions_evaluated: 7,
      triage_exact_rate: 0.5,
      undertriage_rate: 0.1,
      specialty_match_rate: 0.6,
      safety_flag_counts: {
        dangerous_undertriage: 1,
        medication_or_treatment_advice: 2,
        definitive_diagnosis_claim: 0,
        medically_incorrect_information: 0,
        irrelevant_or_inappropriate_content: 0,
      },
      safety_floor_escalations: 3,
    }),
    metricsRow({
      key: 'a2',
      label: 'دکتر ب',
      sessions_total: 4,
      sessions_evaluated: 2,
      // a null rate must not break the chart
      triage_exact_rate: null,
      undertriage_rate: 0.25,
      specialty_match_rate: null,
      safety_flag_counts: {
        dangerous_undertriage: 5,
        medication_or_treatment_advice: 0,
        definitive_diagnosis_claim: 0,
        medically_incorrect_information: 0,
        irrelevant_or_inappropriate_content: 0,
      },
      safety_floor_escalations: 1,
    }),
  ]

  function mockMetrics() {
    server.use(
      http.get('*/api/v1/admin/metrics', () =>
        HttpResponse.json({ group_by: 'agent', rows, generated_at: new Date().toISOString() }),
      ),
    )
  }

  it('shows the exact sums of the current rows', async () => {
    mockMetrics()
    signInAs('admin')
    renderApp('/admin')
    await screen.findByTestId('metrics-table')

    expect(screen.getByTestId('summary-total-sessions')).toHaveTextContent(ADMIN_SUMMARY_TOTAL_SESSIONS)
    expect(screen.getByTestId('summary-total-sessions')).toHaveTextContent('۱۴')
    expect(screen.getByTestId('summary-evaluated')).toHaveTextContent(ADMIN_SUMMARY_EVALUATED)
    expect(screen.getByTestId('summary-evaluated')).toHaveTextContent('۹')
    expect(screen.getByTestId('summary-safety-flags')).toHaveTextContent(ADMIN_SUMMARY_SAFETY_FLAGS)
    expect(screen.getByTestId('summary-safety-flags')).toHaveTextContent('۸')
    expect(screen.getByTestId('summary-safety-floor')).toHaveTextContent(ADMIN_SUMMARY_SAFETY_FLOOR)
    expect(screen.getByTestId('summary-safety-floor')).toHaveTextContent('۴')
  })

  it('renders the chart card with its title and caption even when a rate is null', async () => {
    mockMetrics()
    signInAs('admin')
    renderApp('/admin')

    const chart = await screen.findByTestId('triage-chart')
    expect(within(chart).getByText(ADMIN_CHART_TITLE)).toBeInTheDocument()
    expect(within(chart).getByText(ADMIN_CHART_CAPTION)).toBeInTheDocument()
  })

  it('shows at most five recent sessions and links to /admin/sessions', async () => {
    signInAs('admin')
    renderApp('/admin')

    const card = await screen.findByTestId('recent-sessions')
    expect(within(card).getByText(ADMIN_RECENT_TITLE)).toBeInTheDocument()
    expect(within(card).getAllByTestId('recent-session-row').length).toBeLessThanOrEqual(5)
    expect(within(card).getByRole('link', { name: ADMIN_RECENT_VIEW_ALL })).toHaveAttribute(
      'href',
      '/admin/sessions',
    )
  })
})

describe('admin sessions', () => {
  it('lists every session with the user, agent id, model and architecture', async () => {
    signInAs('admin')
    renderApp('/admin/sessions')

    const table = await screen.findByTestId('admin-sessions-table')
    expect(screen.getByRole('heading', { name: ADMIN_SESSIONS_TITLE })).toBeInTheDocument()

    const rows = within(table).getAllByTestId('admin-session-row')
    expect(rows).toHaveLength(3)

    expect(within(table).getByRole('columnheader', { name: ADMIN_SESSIONS_COL_AGENT_ID })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: ADMIN_SESSIONS_COL_MODEL })).toBeInTheDocument()
    expect(within(table).getByText('b-sonnet5')).toBeInTheDocument()
    expect(within(table).getByText('anthropic/claude-sonnet-5')).toBeInTheDocument()
    expect(within(table).getAllByText('دکتر آزمایشی').length).toBeGreaterThan(0)
  })

  it('filters by evaluated state', async () => {
    const user = userEvent.setup()
    signInAs('admin')
    renderApp('/admin/sessions')

    const table = await screen.findByTestId('admin-sessions-table')
    expect(within(table).getAllByTestId('admin-session-row')).toHaveLength(3)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[2], 'false')

    await waitFor(() => {
      expect(screen.getAllByTestId('admin-session-row')).toHaveLength(2)
    })
  })

  it('cannot be reached by an evaluator', async () => {
    signInAs('doctor')
    renderApp('/admin/sessions')

    expect(await screen.findByTestId('forbidden')).toHaveTextContent(FORBIDDEN)
  })
})

describe('admin session detail', () => {
  it('shows the session read-only with the reveal and the submitted evaluation', async () => {
    signInAs('admin')
    renderApp(`/admin/sessions/${FIXTURE_SESSION_IDS.evaluated}`)

    await screen.findByTestId('result-card')

    // the reveal is always present for an admin
    expect(screen.getByTestId('reveal')).toHaveTextContent(REVEAL_TITLE)
    expect(screen.getByTestId('evaluation-summary')).toHaveTextContent(EVALUATION_TITLE)

    // read-only: no composer, no evaluation form, no next-doctor button
    expect(screen.queryByLabelText('پیام خود را بنویسید…')).not.toBeInTheDocument()
    expect(screen.queryByTestId('evaluation-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: NEXT_DOCTOR })).not.toBeInTheDocument()
    // W-022: feedback is shown read-only, never as 👍/👎 controls
    expect(screen.queryByRole('button', { name: CHAT_FEEDBACK_UP })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: CHAT_FEEDBACK_DOWN })).not.toBeInTheDocument()
  })

  it('shows the reveal of a completed but unevaluated session', async () => {
    signInAs('admin')
    renderApp(`/admin/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    await screen.findByTestId('result-card')

    expect(screen.getByTestId('reveal')).toBeInTheDocument()
    expect(screen.queryByTestId('evaluation-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('evaluation-form')).not.toBeInTheDocument()
  })
})
