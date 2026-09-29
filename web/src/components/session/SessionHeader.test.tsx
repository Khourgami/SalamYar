import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { SESSION_STATUS_LABELS } from '@/i18n/labels'
import { CHAT_PLACEHOLDER, CHAT_SEND } from '@/i18n/uiText'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

describe('session chat shell (DESIGN_SYSTEM §6.3)', () => {
  it('gives the send button the accessible name «ارسال» at every width', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.active}`)
    await screen.findByTestId('questions-counter')

    const send = screen.getByRole('button', { name: CHAT_SEND })
    // the aria-label keeps the name stable when the visible text is hidden below 768px
    expect(send).toHaveAttribute('aria-label', CHAT_SEND)
  })

  it('shows the Persian status label in the header chip', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.active}`)
    await screen.findByTestId('questions-counter')
    expect(screen.getByTestId('session-status')).toHaveTextContent(SESSION_STATUS_LABELS.active)
  })

  it('renders the completed status chip and no composer for a completed session', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)
    await screen.findByTestId('result-card')

    expect(screen.getByTestId('session-status')).toHaveTextContent(SESSION_STATUS_LABELS.completed)
    expect(screen.queryByLabelText(CHAT_PLACEHOLDER)).not.toBeInTheDocument()
  })
})
