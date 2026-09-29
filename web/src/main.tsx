import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import '@/index.css'

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  try {
    const { worker } = await import('@/mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  } catch (error) {
    // A missing worker script (e.g. `public/mockServiceWorker.js` was not shipped)
    // must not blank the whole app: log it and render against the real API instead.
    console.error('[mocks] MSW worker failed to start; continuing without mocks.', error)
  }
}

function renderApp(): void {
  const container = document.getElementById('root')
  if (!container) throw new Error('Root container #root was not found')
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void enableMocking().then(renderApp)
