import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TOKEN_STORAGE_KEY, readStoredToken } from '@/api/client'
import {
  ADMIN_TITLE,
  BANNER,
  DOCTORS_TITLE,
  FORBIDDEN,
  HISTORY_TITLE,
  LOGIN_ERROR,
  LOGIN_PASSWORD,
  LOGIN_SUBMIT,
  LOGIN_USERNAME,
  NAV_LOGOUT,
} from '@/i18n/uiText'
import { renderApp, signInAs } from '@/test/renderApp'
import { setupMockApi } from '@/test/msw'

setupMockApi()

describe('login', () => {
  it('signs in against the mocks and lands on the doctors list', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(screen.getByLabelText(LOGIN_USERNAME), 'doctor')
    await user.type(screen.getByLabelText(LOGIN_PASSWORD), 'doctor123')
    await user.click(screen.getByRole('button', { name: LOGIN_SUBMIT }))

    await waitFor(() => {
      expect(screen.getByText(DOCTORS_TITLE)).toBeInTheDocument()
    })
    expect(readStoredToken()).toBe('mock-token-doctor')
    expect(screen.getByTestId('header-display-name')).toHaveTextContent('دکتر آزمایشی')
  })

  it('shows the Persian error for wrong credentials', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(screen.getByLabelText(LOGIN_USERNAME), 'doctor')
    await user.type(screen.getByLabelText(LOGIN_PASSWORD), 'wrong')
    await user.click(screen.getByRole('button', { name: LOGIN_SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR)
    expect(readStoredToken()).toBeNull()
  })

  it('blocks an empty form without calling the API', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(screen.getByRole('button', { name: LOGIN_SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR)
    expect(readStoredToken()).toBeNull()
  })
})

describe('route guards', () => {
  it('redirects an unauthenticated visitor to /login', async () => {
    renderApp('/')

    expect(await screen.findByRole('button', { name: LOGIN_SUBMIT })).toBeInTheDocument()
    expect(screen.queryByText(DOCTORS_TITLE)).not.toBeInTheDocument()
  })

  it('sends an unauthenticated visitor of a session page to /login', async () => {
    renderApp('/sessions/11111111-1111-4111-8111-111111111111')

    expect(await screen.findByRole('button', { name: LOGIN_SUBMIT })).toBeInTheDocument()
  })

  it('blocks an evaluator from the admin routes', async () => {
    signInAs('doctor')
    renderApp('/admin')

    expect(await screen.findByTestId('forbidden')).toHaveTextContent(FORBIDDEN)
    expect(screen.queryByText(ADMIN_TITLE)).not.toBeInTheDocument()
  })

  it('blocks an evaluator from the admin sessions routes', async () => {
    signInAs('doctor')
    renderApp('/admin/sessions')

    expect(await screen.findByTestId('forbidden')).toHaveTextContent(FORBIDDEN)
  })

  it('lets the admin reach the dashboard and hides the admin links from evaluators', async () => {
    signInAs('admin')
    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: ADMIN_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'داشبورد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'همه جلسات' })).toBeInTheDocument()
  })

  it('hides the admin links from an evaluator', async () => {
    signInAs('doctor')
    renderApp('/')

    await screen.findByText(DOCTORS_TITLE)
    expect(screen.queryByRole('link', { name: 'داشبورد' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'سوابق من' })).toBeInTheDocument()
  })
})

describe('persistent banner', () => {
  it('is present on the login page', async () => {
    renderApp('/login')
    expect(await screen.findByTestId('top-banner')).toHaveTextContent(BANNER)
  })

  it('is present on protected pages', async () => {
    signInAs('doctor')

    const { unmount } = renderApp('/')
    expect(await screen.findByTestId('top-banner')).toHaveTextContent(BANNER)
    unmount()

    renderApp('/history')
    expect(await screen.findByTestId('top-banner')).toHaveTextContent(BANNER)
    expect(await screen.findByRole('heading', { name: HISTORY_TITLE })).toBeInTheDocument()
  })
})

describe('logout', () => {
  it('clears the stored session and returns to /login', async () => {
    const user = userEvent.setup()
    signInAs('doctor')
    renderApp('/')

    await screen.findByText(DOCTORS_TITLE)
    await user.click(screen.getByRole('button', { name: NAV_LOGOUT }))

    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(await screen.findByRole('button', { name: LOGIN_SUBMIT })).toBeInTheDocument()
  })
})
