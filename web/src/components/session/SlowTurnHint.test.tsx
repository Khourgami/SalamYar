import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'

import { createSession } from '@/api/endpoints'
import { CHAT_PLACEHOLDER, CHAT_SEND, CHAT_SLOW_TURN, CHAT_TYPING } from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

/** 30 s turns keep the bubble pending across the 15 s threshold even after timer advancement. */
setupMockApi({ turnDelayMs: 30_000 })

/** UI_SPEC v1.2 §3.3 (D-039) — the bubble captions a slow turn. */
describe('slow-turn hint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Flush the promise chains (MSW fetch → query/mutation → re-render) without advancing time. */
  async function flush(): Promise<void> {
    for (let index = 0; index < 12; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
    }
  }

  async function openFreshSession(): Promise<void> {
    signInAs('doctor')
    const session = await createSession({ agent_id: 'b-sonnet5' })
    renderApp(`/sessions/${session.id}`)
    await flush()
    screen.getByTestId('questions-counter')
  }

  async function send(text: string): Promise<HTMLElement> {
    const input = screen.getByLabelText(CHAT_PLACEHOLDER)
    fireEvent.change(input, { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: CHAT_SEND }))
    await flush()
    return screen.getByTestId('typing-indicator')
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
    await flush()
  }

  it('is inside the typing bubble, hidden at 14.9 s and shown at 15 s', async () => {
    await openFreshSession()
    const bubble = await send('درد دارم')

    // the existing typing text is unchanged and the caption is not there yet
    expect(within(bubble).getByText(CHAT_TYPING)).toBeInTheDocument()
    expect(within(bubble).queryByTestId('slow-turn-hint')).not.toBeInTheDocument()

    await advance(14_900)
    expect(within(bubble).queryByTestId('slow-turn-hint')).not.toBeInTheDocument()

    await advance(100)
    const hint = within(bubble).getByTestId('slow-turn-hint')
    expect(hint).toHaveTextContent(CHAT_SLOW_TURN)
    // it lives inside the typing bubble, next to the unchanged typing text
    expect(within(bubble).getByText(CHAT_TYPING)).toBeInTheDocument()
  })

  it('disappears when the turn ends and starts hidden again for the next turn', async () => {
    await openFreshSession()
    const bubble = await send('اولین پیام')

    await advance(15_000)
    expect(within(bubble).getByTestId('slow-turn-hint')).toBeInTheDocument()

    // let the (30 s) turn finish: the reply arrives and the bubble is gone with its caption
    await advance(15_100)
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()
    expect(screen.queryByTestId('slow-turn-hint')).not.toBeInTheDocument()

    // a brand new turn starts hidden again
    const secondBubble = await send('دومین پیام')
    expect(within(secondBubble).queryByTestId('slow-turn-hint')).not.toBeInTheDocument()
    await advance(15_000)
    expect(within(secondBubble).getByTestId('slow-turn-hint')).toBeInTheDocument()
  })
})
