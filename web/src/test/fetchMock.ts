/**
 * Minimal stand-ins for `Response` so unit tests do not depend on the runtime providing a full
 * Fetch implementation.
 */

/** A duck-typed `Response` with the parts `apiFetch` uses. */
export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {},
    url: '',
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body ?? '')]),
  } as unknown as Response
}

/** A duck-typed `Response` carrying a raw (non-JSON) payload, e.g. the CSV export. */
export function blobResponse(payload: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {},
    url: '',
    text: async () => payload,
    json: async () => JSON.parse(payload),
    blob: async () => new Blob([payload], { type: 'text/csv; charset=utf-8' }),
  } as unknown as Response
}
