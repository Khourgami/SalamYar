/**
 * Build/dev-time environment helpers.
 *
 * Kept free of `import.meta.env` so `vite.config.ts` (executed in Node) and unit tests can both
 * import it: the caller passes the raw value in.
 */

/** Where the Vite dev server proxies `/api` when `VITE_API_PROXY_TARGET` is unset. */
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:8000'

/**
 * Resolve the dev-proxy target. A blank or whitespace-only override falls back to the default, so
 * `VITE_API_PROXY_TARGET=` in `.env` never produces an invalid proxy target.
 */
export function resolveApiProxyTarget(raw?: string | null): string {
  const value = raw?.trim()
  return value ? value : DEFAULT_API_PROXY_TARGET
}
