import { setupServer } from 'msw/node'

import { handlers } from '@/mocks/handlers'

/** MSW server for the test environment (`src/test/msw.ts` wires it into Vitest). */
export const server = setupServer(...handlers)
