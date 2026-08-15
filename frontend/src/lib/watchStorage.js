/**
 * Watch progress, held in one store with two possible backends.
 *
 * Semantics match the `watch_progress` table: an entry existing means the title
 * is *tracked*, and a non-null `watched_at` means it has actually been watched.
 * That gives a watchlist for free and makes completion a plain count of
 * non-null timestamps.
 *
 * Exposed as an external store so `useSyncExternalStore` can subscribe to it.
 * Marking a title watched on the catalog page has to update the progress bar,
 * the prerequisite graph and the header at once, and a store is far less
 * machinery than threading callbacks through every component.
 *
 * Accounts did not change any of that. Signing in swaps the *backend* — where a
 * write goes after the store has already applied it — and leaves the store, its
 * snapshot shape and all six consuming components untouched. Reads stay
 * synchronous, which is what lets a toggle repaint in the same frame whether or
 * not there is a network in the way.
 */

import { api } from '../api/client'
import { reportSyncError } from './syncStatus'

const STORAGE_KEY = 'mcu.watch-progress.v1'

let cache = null
const listeners = new Set()

/**
 * Guests write to localStorage, exactly as this module always did.
 *
 * `persist` receives the whole next map, which localStorage wants, plus the
 * `op` describing what changed, which the server wants. Giving both to both
 * keeps the two backends interchangeable.
 */
const localBackend = {
  async persist(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  },
}

/**
 * Signed in, a write is a delta, not the whole map: sending 54 rows because one
 * checkbox moved would race with any other device doing the same.
 */
const remoteBackend = {
  async persist(_next, op) {
    switch (op.kind) {
      case 'set':
        return api(`/me/watch-progress/${encodeURIComponent(op.movieId)}`, {
          method: 'PUT',
          body: op.entry,
        })
      case 'clear':
        return api(`/me/watch-progress/${encodeURIComponent(op.movieId)}`, { method: 'DELETE' })
      case 'bulk':
        return api('/me/watch-progress/bulk', {
          method: 'POST',
          body: { movie_ids: op.movieIds },
        })
      case 'reset':
        return api('/me/watch-progress', { method: 'DELETE' })
      default:
        return undefined
    }
  },
}

let backend = localBackend

function read() {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    cache = {}
  }
  return cache
}

function notify() {
  for (const listener of listeners) listener()
}

function write(next, op) {
  const previous = read()
  cache = next
  // Notify before persisting, not after: the click has to feel instant, and a
  // rejected write is rare enough to be worth rolling back rather than making
  // every toggle wait for a round trip.
  notify()

  backend.persist(next, op).catch((error) => {
    cache = previous
    notify()
    reportSyncError(error)
  })
}

export function subscribe(listener) {
  listeners.add(listener)
  // Keep tabs in step: another tab writing progress should update this one.
  // Inert while signed in, since nothing writes the key then — harmless, and it
  // keeps guest mode working exactly as before.
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      cache = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The whole map. Referentially stable between writes, as the store contract requires. */
export function getSnapshot() {
  return read()
}

/**
 * Point subsequent writes at the server (or back at localStorage on sign-out)
 * and replace the contents wholesale.
 *
 * Called only by the auth provider. Swapping the backend without also replacing
 * the snapshot would leave one account's progress on screen under another's
 * session, so the two are deliberately one operation.
 */
export function setWatchBackend(mode, snapshot = {}) {
  backend = mode === 'remote' ? remoteBackend : localBackend
  cache = snapshot
  notify()
}

/** Re-read from localStorage on the next snapshot. Used when signing out. */
export function resetToLocalStorage() {
  backend = localBackend
  cache = null
  notify()
}

export function isWatched(progress, movieId) {
  return Boolean(progress[movieId]?.watched_at)
}

export function toggleWatched(movieId) {
  const current = read()
  const next = { ...current }

  if (next[movieId]?.watched_at) {
    // Untracking entirely rather than leaving a null timestamp: without a
    // watchlist feature there is nothing for a tracked-but-unwatched row to mean.
    delete next[movieId]
    write(next, { kind: 'clear', movieId })
    return
  }

  next[movieId] = { ...next[movieId], watched_at: new Date().toISOString() }
  write(next, { kind: 'set', movieId, entry: next[movieId] })
}

export function markManyWatched(movieIds) {
  const next = { ...read() }
  const now = new Date().toISOString()
  for (const movieId of movieIds) {
    if (!next[movieId]?.watched_at) next[movieId] = { ...next[movieId], watched_at: now }
  }
  write(next, { kind: 'bulk', movieIds })
}

export function setRating(movieId, rating) {
  const next = { ...read() }
  next[movieId] = { ...next[movieId], rating }
  write(next, { kind: 'set', movieId, entry: next[movieId] })
}

export function clearAll() {
  write({}, { kind: 'reset' })
}

/** Completion over an arbitrary set of titles. */
export function progressFor(progress, movieIds) {
  const watched = movieIds.filter((id) => isWatched(progress, id))
  return {
    watched: watched.length,
    total: movieIds.length,
    percent: movieIds.length === 0 ? 0 : Math.round((watched.length / movieIds.length) * 100),
    remaining: movieIds.length - watched.length,
  }
}
