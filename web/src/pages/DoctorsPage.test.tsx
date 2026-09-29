import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GREETING_FA, MOCK_AGENTS } from '@/mocks/data'
import { server } from '@/mocks/server'
import {
  CHAT_PLACEHOLDER,
  DOCTORS_EMPTY,
  DOCTORS_HINT,
  DOCTORS_START,
  DOCTORS_TITLE,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

describe('virtual doctors list', () => {
  it('renders one card per enabled agent', async () => {
    signInAs('doctor')
    renderApp('/')

    expect(await screen.findByText(DOCTORS_TITLE)).toBeInTheDocument()
    for (const agent of MOCK_AGENTS) {
      expect(screen.getByRole('heading', { name: agent.display_name })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: DOCTORS_START })).toHaveLength(MOCK_AGENTS.length)
    expect(screen.getByText(DOCTORS_HINT)).toBeInTheDocument()
  })

  it('never renders an agent id', async () => {
    signInAs('doctor')
    const { container } = renderApp('/')

    await screen.findByText(DOCTORS_TITLE)

    const html = container.innerHTML
    for (const agent of MOCK_AGENTS) {
      expect(screen.queryByText(agent.id)).not.toBeInTheDocument()
      expect(html).not.toContain(agent.id)
    }
    expect(html).not.toContain('structured')
    expect(html).not.toContain('simple')
    expect(html).not.toContain('claude')
    expect(html).not.toContain('gpt')
  })

  it('creates a session and navigates to it', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp('/')

    await screen.findByText(DOCTORS_TITLE)
    await user.click(screen.getAllByRole('button', { name: DOCTORS_START })[0])

    // the new session opens with the agent's greeting and an empty composer
    expect(await screen.findByTestId('questions-counter')).toBeInTheDocument()
    expect(screen.getByText(GREETING_FA)).toBeInTheDocument()
    expect(screen.getByLabelText(CHAT_PLACEHOLDER)).toHaveValue('')
    expect(screen.queryByText(DOCTORS_HINT)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is no enabled agent', async () => {
    server.use(http.get('*/api/v1/agents', () => HttpResponse.json([])))
    signInAs('doctor')
    renderApp('/')

    expect(await screen.findByTestId('empty-state')).toHaveTextContent(DOCTORS_EMPTY)
    expect(screen.queryAllByRole('button', { name: DOCTORS_START })).toHaveLength(0)
  })

  it('shows the network error state when the list fails', async () => {
    server.use(
      http.get('*/api/v1/agents', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      ),
    )
    signInAs('doctor')
    renderApp('/')

    // queries retry once, so the failure state appears after the second attempt
    expect(await screen.findByTestId('error-state', {}, { timeout: 5_000 })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText(DOCTORS_TITLE)).not.toBeInTheDocument()
    })
  })
})
