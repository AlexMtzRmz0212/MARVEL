/**
 * Wire layer for the local editor backend (`backend/scripts/catalog_api.py`).
 *
 * Separate from `src/api/client.js` on purpose: that one carries the shipped
 * app's base URL, session cookie and 401 handling, none of which apply to a
 * tool that talks to an unauthenticated process on localhost.
 */

const BASE = '/editor-api'

/**
 * A rejected save, carrying the reasons.
 *
 * The backend answers a refusal two ways — 422 with a list of validation
 * problems, 409 with a single sentence about the file having moved underneath
 * us — and every caller wants to render them the same way, as lines.
 */
export class EditorError extends Error {
  constructor(status, problems) {
    super(problems[0] ?? `Request failed with status ${status}`)
    this.name = 'EditorError'
    this.status = status
    this.problems = problems
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  const response = await fetch(`${BASE}${path}${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let detail = null
    try {
      detail = (await response.json())?.detail
    } catch {
      // A non-JSON error body is not worth failing over.
    }
    const problems = Array.isArray(detail?.problems)
      ? detail.problems
      : [typeof detail === 'string' ? detail : `Request failed with status ${response.status}`]
    throw new EditorError(response.status, problems)
  }

  return response.json()
}

/** The file, its revision, and whether it currently validates. */
export const fetchCatalog = () => request('/catalog')

/** Validate and write the whole document. Rejects rather than writing anything
 *  invalid, and rejects rather than overwriting a newer file on disk. */
export const saveCatalog = (document, revision) =>
  request('/catalog', { method: 'PUT', body: { document, revision } })

/** The controlled vocabularies, straight from the Python enums. */
export const fetchEnums = () => request('/enums')

export const searchTmdb = (title, mediaType) =>
  request('/tmdb/search', { params: { title, media_type: mediaType } })

export const fetchTmdbDetails = (kind, tmdbId, mediaType) =>
  request('/tmdb/details', { params: { kind, tmdb_id: tmdbId, media_type: mediaType } })
