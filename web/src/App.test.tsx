import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import App from '@/App'

describe('App', () => {
  it('renders the application shell', () => {
    render(<App />)

    // the redesigned login page shows the app name in both the compact (mobile) and the
    // full (desktop) brand panel, so more than one match is expected
    expect(screen.getAllByText('آزمایشگاه پزشک مجازی').length).toBeGreaterThan(0)
  })
})
