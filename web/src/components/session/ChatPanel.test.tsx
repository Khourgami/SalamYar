import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createSession } from '@/api/endpoints'
import { MOCK_ERROR_TRIGGER, MOCK_FOLLOW_UP_QUESTIONS } from '@/mocks/data'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { server } from '@/mocks/server'
import {
  CANCEL,
  CHAT_FEEDBACK_CANCEL,
  CHAT_FEEDBACK_NOTE,
  CHAT_FEEDBACK_SAVE,
  CHAT_FEEDBACK_UP,
  CHAT_FINISH,
  CHAT_FINISH_CONFIRM,
  CHAT_PLACEHOLDER,
  CHAT_READ_ONLY,
  CHAT_RESEND,
  CHAT_SEND,
  CHAT_TYPING,
  CONFIRM,
  TURN_IN_PROGRESS,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

/** 60 ms per mock turn keeps the pending state observable without slowing the suite down. */
setupMockApi({ turnDelayMs: 60 })

const activeSessionPath = `/sessions/${FIXTURE_SESSION_IDS.active}`

/** A brand new session has no patient message yet, so the turn counts are predictable. */
async function openFreshSession() {
  signInAs('doctor')
  const session = await createSession({ agent_id: 'b-sonnet5' })
  renderApp(`/sessions/${session.id}`)
  await screen.findByTestId('questions-counter')
  return screen.getByLabelText(CHAT_PLACEHOLDER)
}

async function openFixtureSession(path = activeSessionPath) {
  signInAs('doctor')
  renderApp(path)
  await screen.findByTestId('questions-counter')
  return screen.getByLabelText(CHAT_PLACEHOLDER)
}

describe('chat', () => {
  it('sends a message, shows the typing bubble and then the agent reply', async () => {
    const user = userEvent.setup()
    const input = await openFreshSession()

    await user.type(input, 'درد دارم')
    await user.click(screen.getByRole('button', { name: CHAT_SEND }))

    expect(screen.getByTestId('typing-indicator')).toHaveTextContent(CHAT_TYPING)

    expect(await screen.findByText(MOCK_FOLLOW_UP_QUESTIONS[0])).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('questions-counter')).toHaveTextContent('۱')
    expect(screen.getByText('درد دارم')).toBeInTheDocument()
  })

  it('disables the input and the send button while a turn is running', async () => {
    const user = userEvent.setup()
    const input = await openFreshSession()
    const send = screen.getByRole('button', { name: CHAT_SEND })

    expect(input).toBeEnabled()
    expect(send).toBeDisabled()

    await user.type(input, 'درد دارم')
    expect(send).toBeEnabled()
    await user.click(send)

    expect(input).toBeDisabled()
    expect(send).toBeDisabled()
    expect(input).toHaveValue('')

    await waitFor(() => {
      expect(input).toBeEnabled()
    })
  })

  it('adds a newline on Shift+Enter without sending', async () => {
    const user = userEvent.setup()
    const input = await openFreshSession()

    await user.type(input, 'خط اول')
    await user.type(input, '{Shift>}{Enter}{/Shift}')
    await user.type(input, 'خط دوم')

    expect(input).toHaveValue('خط اول\nخط دوم')
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
  })

  it('shows the 409 toast and restores the text when the turn was rejected', async () => {
    server.use(
      http.post('*/api/v1/sessions/:sessionId/messages', () =>
        HttpResponse.json(
          { error: { code: 'TURN_IN_PROGRESS', message: 'A turn is already running.' } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    const input = await openFreshSession()

    await user.type(input, 'پیام دوم')
    await user.click(screen.getByRole('button', { name: CHAT_SEND }))

    expect(await screen.findByTestId('toast')).toHaveTextContent(TURN_IN_PROGRESS)
    await waitFor(() => {
      expect(input).toHaveValue('پیام دوم')
    })
  })

  it('switches to the completed view on the 5th patient message without a reload', async () => {
    const user = userEvent.setup()
    // the fixture already has 4 patient messages
    const input = await openFixtureSession()

    await user.type(input, 'تب هم ندارم و اشتها\u200cم خوب است')
    await user.click(screen.getByRole('button', { name: CHAT_SEND }))

    expect(await screen.findByTestId('completed-view')).toBeInTheDocument()
    expect(screen.queryByTestId('completed-view')).toBeInTheDocument()
    expect(screen.queryByLabelText(CHAT_PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.getByText(CHAT_READ_ONLY)).toBeInTheDocument()
  })
})

describe('502 AGENT_ERROR', () => {
  it('appends the error bubble and resends the same text without duplicating it', async () => {
    const user = userEvent.setup()
    const input = await openFreshSession()
    const text = `متن ${MOCK_ERROR_TRIGGER}`

    await user.type(input, text)
    await user.click(screen.getByRole('button', { name: CHAT_SEND }))

    expect(await screen.findByTestId('message-error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: CHAT_RESEND }))

    await waitFor(() => {
      const patientBubbles = screen
        .getAllByTestId('message-text')
        .filter((bubble) => bubble.textContent?.includes(MOCK_ERROR_TRIGGER))
      expect(patientBubbles).toHaveLength(1)
    })
  })
})

describe('finish', () => {
  it('asks for confirmation and then completes the session', async () => {
    const user = userEvent.setup()
    await openFixtureSession()

    await user.click(screen.getByRole('button', { name: CHAT_FINISH }))

    const dialog = await screen.findByTestId('confirm-dialog')
    expect(dialog).toHaveTextContent(CHAT_FINISH_CONFIRM)

    await user.click(within(dialog).getByRole('button', { name: CANCEL }))
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('completed-view')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: CHAT_FINISH }))
    const reopened = await screen.findByTestId('confirm-dialog')
    await user.click(within(reopened).getByRole('button', { name: CONFIRM }))

    expect(await screen.findByTestId('completed-view')).toBeInTheDocument()
    expect(screen.queryByLabelText(CHAT_PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.getByText(CHAT_READ_ONLY)).toBeInTheDocument()
  })
})

describe('per-message feedback', () => {
  it('toggles a rating, saves a note and toggles the rating off again', async () => {
    const user = userEvent.setup()
    await openFixtureSession()

    const upButtons = await screen.findAllByLabelText(CHAT_FEEDBACK_UP)
    expect(upButtons.length).toBeGreaterThan(0)
    expect(upButtons[0]).toHaveAttribute('aria-pressed', 'false')

    await user.click(upButtons[0])
    await waitFor(() => {
      expect(screen.getAllByLabelText(CHAT_FEEDBACK_UP)[0]).toHaveAttribute('aria-pressed', 'true')
    })

    await user.click(screen.getAllByRole('button', { name: CHAT_FEEDBACK_NOTE })[0])
    await user.type(screen.getByLabelText(CHAT_FEEDBACK_NOTE), 'سؤال خوبی بود')
    await user.click(screen.getByRole('button', { name: CHAT_FEEDBACK_SAVE }))

    expect(await screen.findByText('سؤال خوبی بود')).toBeInTheDocument()

    await user.click(screen.getAllByLabelText(CHAT_FEEDBACK_UP)[0])
    await waitFor(() => {
      expect(screen.getAllByLabelText(CHAT_FEEDBACK_UP)[0]).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('offers the note field but blocks saving until a rating is chosen', async () => {
    const user = userEvent.setup()
    await openFixtureSession()

    await user.click(screen.getAllByRole('button', { name: CHAT_FEEDBACK_NOTE })[0])

    expect(screen.getByRole('button', { name: CHAT_FEEDBACK_SAVE })).toBeDisabled()
    expect(screen.getByRole('button', { name: CHAT_FEEDBACK_CANCEL })).toBeInTheDocument()
  })

  it('is read-only on the pre-evaluated fixture', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.evaluated}`)
    await screen.findByTestId('questions-counter')

    expect(screen.queryAllByLabelText(CHAT_FEEDBACK_UP)).toHaveLength(0)
    expect(screen.queryByLabelText(CHAT_PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.getByText('سؤال\u200cها کوتاه و بدون القا بودند.')).toBeInTheDocument()
  })
})
