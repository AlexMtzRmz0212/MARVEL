/**
 * Wire layer for the editor's half of the API (`/api/admin`).
 *
 * Separate from `src/api/client.js` on purpose: that one signs the visitor out
 * of their *account* on any 401, and a 401 here means something else — the
 * editor password is missing or has expired — which the admin page answers by
 * showing the password form, not by touching the user's session.
 *
 * The cookie that carries it is its own, HttpOnly and only ever sent to this
 * path, so none of this code can see it.
 */

const BASE = '/api/admin'

/**
 * A rejected request, carrying the reasons.
 *
 * The backend answers a refusal two ways — 422 with a list of validation
 * problems, 409 with a single sentence about the catalog having moved underneath
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

  return response.status === 204 ? null : response.json()
}

/** The file, its revision, and whether it currently validates. */
export const fetchCatalog = () => request('/catalog')

/** Validate and store the whole document. Rejects rather than storing anything
 *  invalid, and rejects rather than overwriting a newer version. */
export const saveCatalog = (document, revision) =>
  request('/catalog', { method: 'PUT', body: { document, revision } })

/** The controlled vocabularies, straight from the Python enums. */
export const fetchEnums = () => request('/enums')

export const searchTmdb = (title, mediaType) =>
  request('/tmdb/search', { params: { title, media_type: mediaType } })

export const fetchTmdbDetails = (kind, tmdbId, mediaType) =>
  request('/tmdb/details', { params: { kind, tmdb_id: tmdbId, media_type: mediaType } })

/** Whether this browser holds a valid editor session, and whether there is a
 *  password at all (`open`: a dev environment with none configured). A 404 means
 *  the server has the editor switched off. */
export const fetchSession = () => request('/session')

export const signIn = (password) => request('/login', { method: 'POST', body: { password } })

export const signOut = () => request('/logout', { method: 'POST' })

/** What deleting a title would destroy: saved-order rows and progress rows. */
export const fetchUsage = (movieId) => request(`/titles/${encodeURIComponent(movieId)}/usage`)

/** TMDb's episode list for a saved series: rows to store in the document's
 *  `episodes`. Writes nothing itself. */
export const fetchTitleEpisodes = (movieId) =>
  request(`/titles/${encodeURIComponent(movieId)}/episodes/fetch`, { method: 'POST' })

export const fetchHistory = () => request('/catalog/history')

export const restoreCatalog = (historyId, revision) =>
  request('/catalog/restore', { method: 'POST', body: { history_id: historyId, revision } })

/** The export is a download, so it is a link rather than a request. */
export const EXPORT_URL = `${BASE}/catalog/export`
