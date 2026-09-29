/**
 * Empty stand-in for `@/mocks/browser`.
 *
 * `vite.config.ts` aliases `@/mocks/browser` to this module whenever `VITE_USE_MOCKS` is not
 * `true` at build time, so the production `dist/` never contains MSW, the handlers or the
 * fixtures. `main.tsx` only imports the real worker when mocking is enabled, so this module is
 * never actually executed — it exists so the import resolves and Rollup emits no mock chunk.
 */

export const worker = {
  async start(): Promise<void> {
    /* no-op: mocks are disabled in this build */
  },
}
