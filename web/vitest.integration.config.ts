import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Contract-conformance suite (`npm run test:int`).
 *
 * Runs in the **node** environment against a live backend dev server and is deliberately excluded
 * from `npm run test` (see `vite.config.ts`), so the fast unit suite never needs network or a
 * running server. Base URL: `INTEGRATION_API_URL` (default `http://localhost:8000/api/v1`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    // The dev server simulates LLM latency and the suite creates many sessions and turns.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
})
