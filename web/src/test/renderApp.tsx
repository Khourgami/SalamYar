import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AppProviders, AppRoutes, ROUTER_FUTURE_FLAGS } from '@/App'
import { writeStoredAuth } from '@/api/client'
import { MOCK_USERS, mockToken, publicUser } from '@/mocks/data'

/** Render the full app (providers + routes) at `initialPath`. */
export function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]} future={ROUTER_FUTURE_FLAGS}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  )
}

/** Write a valid auth pair into localStorage so the guards treat the visitor as signed in. */
export function signInAs(username: 'doctor' | 'admin'): void {
  const record = MOCK_USERS.find((user) => user.username === username)
  if (!record) throw new Error(`Unknown mock user: ${username}`)
  writeStoredAuth(mockToken(record.username), publicUser(record))
}
