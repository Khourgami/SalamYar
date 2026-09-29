import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MOCK_AGENTS } from '@/mocks/data'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { KPI_KEYS, KPI_LABELS } from '@/i18n/labels'
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
