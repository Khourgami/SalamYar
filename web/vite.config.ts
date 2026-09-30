import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { resolveApiProxyTarget } from './src/config/env'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useMocks = env.VITE_USE_MOCKS === 'true'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Keep dev-with-mocks working, but never ship MSW in a production bundle: when mocks are
        // disabled the worker module resolves to an empty stub (phase-1 known issue 1).
        ...(useMocks
          ? {}
          : {
              '@/mocks/browser': fileURLToPath(
                new URL('./src/mocks/browser.stub.ts', import.meta.url),
              ),
            }),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // `public/` only holds the MSW worker, so a production build must not copy it (T1).
      // The dev server still serves `public/` while mocks are enabled.
      copyPublicDir: useMocks,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          // Configurable so integration work can point the dev server at another backend port (W-041).
          target: resolveApiProxyTarget(env.VITE_API_PROXY_TARGET),
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      // `test:int` (contract conformance against a live backend) is a separate, node-environment
      // suite; keep it out of the fast jsdom unit run.
      exclude: [...configDefaults.exclude, 'src/integration/**'],
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
    },
  }
})
