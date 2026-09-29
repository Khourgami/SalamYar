import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { KPI_KEYS, KPI_LABELS } from '@/i18n/labels'
import {
  EVALUATION_COMPARE_CHECKBOX,
  EVALUATION_COMPARE_SELECT,
  EVALUATION_KPI_TITLE,
  EVALUATION_REQUIRED,
  EVALUATION_SAFETY_TITLE,
  EVALUATION_SUBMIT,
  EVALUATION_TITLE,
  EVALUATION_UNNECESSARY_QUESTIONS,
  EVALUATION_VERDICT_DIAGNOSIS,
  EVALUATION_VERDICT_SPECIALTY,
  EVALUATION_VERDICT_TRIAGE,
  NEXT_DOCTOR,
  REVEAL_TITLE,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

const completedPath = `/sessions/${FIXTURE_SESSION_IDS.completedStructured}`

async function openUnevaluatedSession() {
  signInAs('doctor')
  renderApp(completedPath)
  await screen.findByTestId('result-card')
}

/** Fill every required field of the form. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  for (const key of KPI_KEYS) {
    const group = screen.getByRole('group', { name: KPI_LABELS[key].label })
    await user.click(within(group).getByRole('radio', { name: '۴' }))
  }
  await user.selectOptions(screen.getByLabelText(EVALUATION_VERDICT_TRIAGE), 'ROUTINE_DAYS')
  await user.selectOptions(screen.getByLabelText(EVALUATION_VERDICT_SPECIALTY), 'gastroenterology')
}

describe('evaluation form', () => {
  it('renders every required block', async () => {
    await openUnevaluatedSession()

    const form = await screen.findByTestId('evaluation-form')
    expect(within(form).getByText(EVALUATION_TITLE)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_KPI_TITLE, { exact: false })).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_UNNECESSARY_QUESTIONS)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_SAFETY_TITLE)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_VERDICT_TRIAGE)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_VERDICT_SPECIALTY)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_VERDICT_DIAGNOSIS)).toBeInTheDocument()
    expect(within(form).getByText(EVALUATION_COMPARE_CHECKBOX)).toBeInTheDocument()

    for (const key of KPI_KEYS) {
      expect(within(form).getByText(KPI_LABELS[key].label)).toBeInTheDocument()
      // the 1/3/5 anchors are shown under each group
      expect(within(form).getByText(KPI_LABELS[key].anchors[1])).toBeInTheDocument()
      expect(within(form).getByText(KPI_LABELS[key].anchors[3])).toBeInTheDocument()
      expect(within(form).getByText(KPI_LABELS[key].anchors[5])).toBeInTheDocument()
    }
    expect(within(form).getAllByRole('radio', { name: '۴' })).toHaveLength(9)
  })

  it('blocks submission and marks every missing required field', async () => {
    const user = userEvent.setup()
    await openUnevaluatedSession()

    const form = await screen.findByTestId('evaluation-form')
    await user.click(within(form).getByRole('button', { name: EVALUATION_SUBMIT }))

    await waitFor(() => {
      expect(within(form).getAllByText(EVALUATION_REQUIRED)).toHaveLength(KPI_KEYS.length + 2)
    })
    // the form is still there and the session is still unevaluated
    expect(screen.getByTestId('evaluation-form')).toBeInTheDocument()
    expect(screen.queryByTestId('reveal')).not.toBeInTheDocument()
  })

  it('clears the error of a field once it is filled in', async () => {
    const user = userEvent.setup()
    await openUnevaluatedSession()

    const form = await screen.findByTestId('evaluation-form')
    await user.click(within(form).getByRole('button', { name: EVALUATION_SUBMIT }))
    expect(within(form).getAllByText(EVALUATION_REQUIRED)).toHaveLength(KPI_KEYS.length + 2)

    const group = screen.getByRole('group', { name: KPI_LABELS[KPI_KEYS[0]].label })
    await user.click(within(group).getByRole('radio', { name: '۵' }))

    await waitFor(() => {
      expect(within(form).getAllByText(EVALUATION_REQUIRED)).toHaveLength(KPI_KEYS.length + 1)
    })
  })

  it('hides the reveal until the evaluation is submitted', async () => {
    await openUnevaluatedSession()

    expect(screen.queryByTestId('reveal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('evaluation-summary')).not.toBeInTheDocument()
  })
})

describe('submitting an evaluation', () => {
  it('shows the read-only answers and the reveal', async () => {
    const user = userEvent.setup()
    await openUnevaluatedSession()
    await fillRequiredFields(user)

    await user.click(screen.getByRole('button', { name: EVALUATION_SUBMIT }))

    const summary = await screen.findByTestId('evaluation-summary')
    expect(within(summary).getAllByText('۴')).toHaveLength(KPI_KEYS.length)

    // the form is gone and the reveal + next-doctor button appeared
    expect(screen.queryByTestId('evaluation-form')).not.toBeInTheDocument()
    const reveal = await screen.findByTestId('reveal')
    expect(within(reveal).getByText(REVEAL_TITLE)).toBeInTheDocument()
    expect(within(reveal).getByText('ساختاریافته')).toBeInTheDocument()
    expect(within(reveal).getByText('google/gemini-3.1-pro')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: NEXT_DOCTOR })).toHaveAttribute('href', '/')
  })

  it('keeps the reveal hidden for a completed but unevaluated session', async () => {
    await openUnevaluatedSession()

    expect(screen.queryByTestId('reveal')).not.toBeInTheDocument()
  })
})

describe('comparison select', () => {
  it('lists only the other completed sessions', async () => {
    const user = userEvent.setup()
    await openUnevaluatedSession()

    const form = await screen.findByTestId('evaluation-form')
    await user.click(within(form).getByText(EVALUATION_COMPARE_CHECKBOX))

    const select = await screen.findByLabelText(EVALUATION_COMPARE_SELECT)
    const options = within(select).getAllByRole('option')

    // placeholder + the one other completed session (the evaluated fixture)
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveValue('')
    expect(options[1]).toHaveValue(FIXTURE_SESSION_IDS.evaluated)
    expect(options[1].textContent).toContain('دکتر ۵')
    expect(options[1].textContent).toContain('دو روز است گلویم درد می\u200cکند')

    // the current session is never offered
    expect(within(select).queryByText(/دکتر ۸/)).not.toBeInTheDocument()
  })
})
