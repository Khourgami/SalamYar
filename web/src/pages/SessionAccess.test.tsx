import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { submitEvaluation } from '@/api/endpoints'
import type { EvaluationInput } from '@/api/types'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { KPI_KEYS, KPI_LABELS } from '@/i18n/labels'
import {
  EVALUATION_LOCKED,
  EVALUATION_SUBMIT,
  EVALUATION_VERDICT_SPECIALTY,
  EVALUATION_VERDICT_TRIAGE,
  FORBIDDEN,
  NAV_DOCTORS,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { validEvaluationInput } from '@/test/factories'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

const completedPath = `/sessions/${FIXTURE_SESSION_IDS.completedStructured}`

/** Fill every required field of the evaluation form. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  for (const key of KPI_KEYS) {
    const group = screen.getByRole('group', { name: KPI_LABELS[key].label })
    await user.click(within(group).getByRole('radio', { name: '۴' }))
  }
  await user.selectOptions(screen.getByLabelText(EVALUATION_VERDICT_TRIAGE), 'ROUTINE_DAYS')
  await user.selectOptions(screen.getByLabelText(EVALUATION_VERDICT_SPECIALTY), 'gastroenterology')
}

describe('session access (v1.1)', () => {
  it('shows the «دسترسی ندارید» page state when the session belongs to another user', async () => {
    // doctor2 logs in but the fixture session is doctor's
    signInAs('doctor2')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.active}`)

    // the query retries once before erroring, so allow for the retry delay
    const state = await screen.findByTestId('session-forbidden', {}, { timeout: 4_000 })
    expect(within(state).getByText(FORBIDDEN)).toBeInTheDocument()
    // the link back to the doctors list is offered instead of a retry
    expect(within(state).getByRole('link', { name: NAV_DOCTORS })).toHaveAttribute('href', '/')
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
  })
})

describe('submitting an already-evaluated session (409 EVALUATION_LOCKED)', () => {
  it('shows the §4 toast and refetches the session into the evaluated state', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp(completedPath)
    await screen.findByTestId('result-card')
    const form = await screen.findByTestId('evaluation-form')

    // the same session is evaluated elsewhere (e.g. another tab) before the form is submitted
    await submitEvaluation(
      FIXTURE_SESSION_IDS.completedStructured,
      validEvaluationInput() as EvaluationInput,
    )

    await fillRequiredFields(user)
    await user.click(within(form).getByRole('button', { name: EVALUATION_SUBMIT }))

    expect(await screen.findByTestId('toast')).toHaveTextContent(EVALUATION_LOCKED)

    // the session is refetched: the form is replaced by the read-only summary and the reveal
    await waitFor(() => {
      expect(screen.queryByTestId('evaluation-form')).not.toBeInTheDocument()
    })
    expect(await screen.findByTestId('evaluation-summary')).toBeInTheDocument()
    expect(screen.getByTestId('reveal')).toBeInTheDocument()
  })
})
