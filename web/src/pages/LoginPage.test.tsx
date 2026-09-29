import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  LOGIN_ERROR,
  LOGIN_PASSWORD,
  LOGIN_SUBMIT,
  LOGIN_TITLE,
  LOGIN_USERNAME,
  PASSWORD_SHOW,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp } from '@/test/renderApp'

setupMockApi()

describe('login page (DESIGN_SYSTEM §6.1)', () => {
  it('shows the error and focuses the username field after a failed login', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    expect(await screen.findByRole('heading', { name: LOGIN_TITLE })).toBeInTheDocument()

    await user.type(screen.getByLabelText(LOGIN_USERNAME), 'doctor')
    await user.type(screen.getByLabelText(LOGIN_PASSWORD), 'wrong')
    await user.click(screen.getByRole('button', { name: LOGIN_SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR)
    expect(screen.getByLabelText(LOGIN_USERNAME)).toHaveFocus()
  })

  it('offers only the submit button and the password toggle in the form', async () => {
    renderApp('/login')

    const submit = await screen.findByRole('button', { name: LOGIN_SUBMIT })
    const form = submit.closest('form')
    expect(form).not.toBeNull()

    const buttons = within(form as HTMLFormElement).getAllByRole('button')
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['', LOGIN_SUBMIT])
    expect(within(form as HTMLFormElement).getByRole('button', { name: PASSWORD_SHOW })).toBeInTheDocument()
    expect(within(form as HTMLFormElement).queryAllByRole('link')).toHaveLength(0)
  })
})
