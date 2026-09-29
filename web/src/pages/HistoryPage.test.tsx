import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import {
  HISTORY_COL_DATE,
  HISTORY_COL_DOCTOR,
  HISTORY_COL_EVALUATED,
  HISTORY_COL_FIRST_MESSAGE,
  HISTORY_COL_RESULT,
  HISTORY_COL_STATUS,
  HISTORY_EVALUATED_NO,
  HISTORY_EVALUATED_YES,
  HISTORY_TAB_ALL,
  HISTORY_TAB_UNEVALUATED,
  HISTORY_TITLE,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

async function openHistory() {
  signInAs('doctor')
  renderApp('/history')
  await screen.findByTestId('history-table')
  return screen.getByTestId('history-table')
}

describe('my sessions', () => {
  it('renders the fixture sessions with the exact columns', async () => {
    const table = await openHistory()

    expect(screen.getByRole('heading', { name: HISTORY_TITLE })).toBeInTheDocument()

    for (const header of [
      HISTORY_COL_DOCTOR,
      HISTORY_COL_DATE,
      HISTORY_COL_FIRST_MESSAGE,
      HISTORY_COL_STATUS,
      HISTORY_COL_RESULT,
      HISTORY_COL_EVALUATED,
    ]) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }

    const rows = within(table).getAllByTestId('history-row')
    expect(rows).toHaveLength(3)

    // the newest session first: the active one
    expect(within(rows[0]).getByText('دکتر ۶')).toBeInTheDocument()
    expect(within(rows[0]).getByText('در جریان')).toBeInTheDocument()
    expect(within(rows[0]).getByText(HISTORY_EVALUATED_NO)).toBeInTheDocument()

    // the completed structured session shows its triage badge
    expect(within(rows[1]).getByText('تمام\u200cشده')).toBeInTheDocument()
    expect(within(rows[1]).getByTestId('triage-badge')).toHaveTextContent('فوری — ظرف ۲۴ ساعت')

    // the evaluated fixture is flagged as evaluated
    expect(within(rows[2]).getByText(HISTORY_EVALUATED_YES)).toBeInTheDocument()
    expect(within(rows[2]).getByText('دکتر ۵')).toBeInTheDocument()
  })

  it('filters with the ارزیابی‌نشده tab', async () => {
    const user = userEvent.setup()
    await openHistory()

    expect(screen.getAllByTestId('history-row')).toHaveLength(3)
    // phase 2 T8: the tabs are now a `role="tablist"` segmented control (DESIGN_SYSTEM §6.7)
    expect(screen.getByRole('tab', { name: HISTORY_TAB_ALL })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.click(screen.getByRole('tab', { name: HISTORY_TAB_UNEVALUATED }))

    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(2)
    })
    expect(screen.queryByText(HISTORY_EVALUATED_YES)).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: HISTORY_TAB_UNEVALUATED })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.click(screen.getByRole('tab', { name: HISTORY_TAB_ALL }))
    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(3)
    })
  })

  it('opens a session when a row is clicked', async () => {
    const user = userEvent.setup()
    const table = await openHistory()

    const rows = within(table).getAllByTestId('history-row')
    await user.click(rows[1])

    // the completed structured fixture renders its result card
    expect(await screen.findByTestId('result-card')).toBeInTheDocument()
    expect(screen.queryByTestId('history-table')).not.toBeInTheDocument()
  })

  it('keeps the active fixture reachable from its row', async () => {
    const user = userEvent.setup()
    const table = await openHistory()

    const rows = within(table).getAllByTestId('history-row')
    await user.click(rows[0])

    expect(await screen.findByTestId('questions-counter')).toBeInTheDocument()
    expect(screen.getByLabelText('پیام خود را بنویسید…')).toBeInTheDocument()
    expect(FIXTURE_SESSION_IDS.active).toBeTruthy()
  })
})
