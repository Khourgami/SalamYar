import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import {
  BACKSTAGE_CANT_MISS,
  BACKSTAGE_CLINICAL_STATE,
  BACKSTAGE_EMERGENCY_PROBABILITY,
  BACKSTAGE_HYPOTHESES,
  BACKSTAGE_NEXT_ACTION,
  BACKSTAGE_QUESTION_RATIONALE,
  BACKSTAGE_REASONING_NOTE,
  BACKSTAGE_STOP_REASON,
  BACKSTAGE_TITLE,
  BACKSTAGE_TOGGLE_HIDE,
  BACKSTAGE_TOGGLE_SHOW,
} from '@/i18n/uiText'
import { NEXT_ACTION_LABELS } from '@/i18n/labels'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

describe('backstage — structured (b-) session', () => {
  it('renders one timeline item per agent turn (questions + the conclusion) with the structured fields', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const panel = await screen.findByTestId('backstage-panel')
    expect(within(panel).getByText(BACKSTAGE_TITLE)).toBeInTheDocument()

    const turns = within(panel).getAllByTestId('backstage-turn')
    expect(turns).toHaveLength(5)

    // the item title is the text of the agent message the reasoning produced
    expect(
      within(turns[0]).getByText('درد از دیروز شروع شد یا زودتر؟ و ناگهانی بود یا کم\u200cکم؟'),
    ).toBeInTheDocument()

    expect(within(panel).getAllByText(BACKSTAGE_QUESTION_RATIONALE).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(BACKSTAGE_EMERGENCY_PROBABILITY).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(BACKSTAGE_HYPOTHESES).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(BACKSTAGE_NEXT_ACTION).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(BACKSTAGE_CANT_MISS).length).toBeGreaterThan(0)

    expect(within(panel).getAllByTestId('backstage-hypotheses').length).toBeGreaterThan(0)
    expect(within(panel).getAllByText('کوله\u200cسیستیت حاد').length).toBeGreaterThan(0)

    // the simple-architecture note is not part of a structured turn
    expect(within(panel).queryByText(BACKSTAGE_REASONING_NOTE)).not.toBeInTheDocument()

    // the clinical state is collapsed by default
    expect(within(panel).queryByTestId('clinical-state')).not.toBeInTheDocument()
  })

  it('includes a concluding turn for the result message (T4 realism alignment)', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const panel = await screen.findByTestId('backstage-panel')
    const turns = within(panel).getAllByTestId('backstage-turn')
    const last = turns[turns.length - 1]

    // matches the real backend: the concluding result message has its own BackstageTurn with
    // next_action "conclude" and a stop_reason.
    expect(within(last).getByText(NEXT_ACTION_LABELS.conclude)).toBeInTheDocument()
    expect(within(last).getByText(BACKSTAGE_STOP_REASON)).toBeInTheDocument()
  })

  it('expands the clinical state as nested key/value lists', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const clinicalStateButtons = await screen.findAllByRole('button', {
      name: BACKSTAGE_CLINICAL_STATE,
    })
    await user.click(clinicalStateButtons[0])

    const state = await screen.findByTestId('clinical-state')
    // keys stay English (UI_SPEC §3.3 B)
    expect(within(state).getByText('age_years')).toBeInTheDocument()
    expect(within(state).getByText('۶۸')).toBeInTheDocument()
    expect(within(state).getByText('chief_complaint')).toBeInTheDocument()
    // nested objects and lists are rendered too
    expect(within(state).getByText('symptoms')).toBeInTheDocument()
    expect(within(state).getByText('severity_0_10')).toBeInTheDocument()
    expect(within(state).getByText('other_relevant')).toBeInTheDocument()
  })

  it('collapses and expands the whole panel', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const panel = await screen.findByTestId('backstage-panel')
    expect(within(panel).getAllByTestId('backstage-turn')).toHaveLength(5)

    await user.click(within(panel).getByRole('button', { name: BACKSTAGE_TOGGLE_HIDE }))
    expect(within(panel).queryAllByTestId('backstage-turn')).toHaveLength(0)

    await user.click(within(panel).getByRole('button', { name: BACKSTAGE_TOGGLE_SHOW }))
    expect(within(panel).getAllByTestId('backstage-turn')).toHaveLength(5)
  })
})

describe('backstage — simple (a-) session', () => {
  it('renders only the reasoning note', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.evaluated}`)

    const panel = await screen.findByTestId('backstage-panel')
    const turns = within(panel).getAllByTestId('backstage-turn')
    expect(turns).toHaveLength(4)

    expect(within(panel).getAllByText(BACKSTAGE_REASONING_NOTE).length).toBe(4)
    expect(within(panel).queryByText(BACKSTAGE_QUESTION_RATIONALE)).not.toBeInTheDocument()
    expect(within(panel).queryByText(BACKSTAGE_HYPOTHESES)).not.toBeInTheDocument()
    expect(within(panel).queryByText(BACKSTAGE_CLINICAL_STATE)).not.toBeInTheDocument()
    expect(within(panel).queryByTestId('backstage-hypotheses')).not.toBeInTheDocument()
  })
})
