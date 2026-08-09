/**
 * Watch progress, persisted in localStorage.
 *
 * Semantics match the `watch_progress` table waiting in the backend: an entry
 * existing means the title is *tracked*, and a non-null `watched_at` means it
 * has actually been watched. That gives a watchlist for free and makes
 * completion a plain count of non-null timestamps.
 *
 * Exposed as an external store so `useSyncExternalStore` can subscribe to it.
 * Marking a title watched on the catalog page has to update the progress bar,
 * the prerequisite graph and the header at once, and a store is far less
 * machinery than threading callbacks through every component.
 */

const STORAGE_KEY = 'mcu.watch-progress.v1'

let cache = null
const listeners = new Set()

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

function write(next) {
  cache = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const listener of listeners) listener()
}

export function subscribe(listener) {
  listeners.add(listener)
  // Keep tabs in step: another tab writing progress should update this one.
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
  } else {
    next[movieId] = { ...next[movieId], watched_at: new Date().toISOString() }
  }
  write(next)
}

export function markManyWatched(movieIds) {
  const next = { ...read() }
  const now = new Date().toISOString()
  for (const movieId of movieIds) {
    if (!next[movieId]?.watched_at) next[movieId] = { ...next[movieId], watched_at: now }
  }
  write(next)
}

export function setRating(movieId, rating) {
  const next = { ...read() }
  next[movieId] = { ...next[movieId], rating }
  write(next)
}

export function clearAll() {
  write({})
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
