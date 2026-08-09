/**
 * Thin fetch wrapper.
 *
 * TanStack Query handles caching, retries and invalidation; this layer only
 * deals with the wire: base URL, credentials, query strings, and turning a
 * non-2xx response into a typed error.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  constructor(status, detail, body) {
    super(detail || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Registered by the auth provider so a 401 can trigger a logout without this
 * module importing React context -- which would create an import cycle.
 */
let onUnauthorized = null
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function api(path, { method = 'GET', body, params, signal } = {}) {
  const response = await fetch(`${BASE_URL}${path}${buildQuery(params)}`, {
    method,
    signal,
    // Same-origin in both dev (via the Vite proxy) and production (via Vercel's
    // rewrite), so the session cookie rides along without CORS credentials.
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) onUnauthorized()
    let payload = null
    try {
      payload = await response.json()
    } catch {
      // A non-JSON error body is not worth failing over.
    }
    throw new ApiError(response.status, payload?.detail, payload)
  }

  return response.status === 204 ? null : response.json()
}
