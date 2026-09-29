import { setupWorker } from 'msw/browser'

import { handlers } from '@/mocks/handlers'

/** MSW worker for the browser. Started from `main.tsx` only when `VITE_USE_MOCKS === "true"`. */
export const worker = setupWorker(...handlers)
