import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BANNER, NAV_DASHBOARD, NAV_DOCTORS, NAV_HISTORY, NAV_MENU } from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

describe('app shell drawer (DESIGN_SYSTEM §4.2)', () => {
  it('opens from the menu button, closes on Escape and returns focus to it', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp('/')

    const menuButton = screen.getByRole('button', { name: NAV_MENU })
    await user.click(menuButton)

    const drawer = await screen.findByTestId('drawer')
    expect(within(drawer).getByRole('link', { name: NAV_DOCTORS ?? 'پزشک‌ها' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByTestId('drawer')).not.toBeInTheDocument()
    })
    expect(menuButton).toHaveFocus()
  })

  it('closes on an overlay click', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp('/')

    await user.click(screen.getByRole('button', { name: NAV_MENU }))
    await screen.findByTestId('drawer')

    await user.click(screen.getByTestId('drawer-overlay'))
    await waitFor(() => {
      expect(screen.queryByTestId('drawer')).not.toBeInTheDocument()
    })
  })

  it('closes on navigation', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp('/')

    await user.click(screen.getByRole('button', { name: NAV_MENU }))
    const drawer = await screen.findByTestId('drawer')

    await user.click(within(drawer).getByRole('link', { name: NAV_HISTORY }))

    await waitFor(() => {
      expect(screen.queryByTestId('drawer')).not.toBeInTheDocument()
    })
  })
})

describe('app shell navigation', () => {
  it('marks the active item with aria-current="page"', async () => {
    signInAs('doctor')
    renderApp('/history')

    const link = await screen.findByRole('link', { name: NAV_HISTORY })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('hides the admin items from an evaluator', async () => {
    signInAs('doctor')
    renderApp('/')

    await screen.findByRole('link', { name: NAV_HISTORY })
    expect(screen.queryByRole('link', { name: NAV_DASHBOARD })).not.toBeInTheDocument()
  })

  it('keeps the banner on the login page and on a protected page', async () => {
    const { unmount } = renderApp('/login')
    expect(await screen.findByTestId('top-banner')).toHaveTextContent(BANNER)
    unmount()

    signInAs('doctor')
    renderApp('/')
    expect(await screen.findByTestId('top-banner')).toHaveTextContent(BANNER)
  })
})
