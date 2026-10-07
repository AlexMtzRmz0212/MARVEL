/**
 * Watch progress, held in one store with two possible backends.
 *
 * Semantics match the `watch_progress` table: an entry existing means the title
 * is *tracked*, and a non-null `watched_at` means it has actually been watched.
 * That gives a watchlist for free and makes completion a plain count of
 * non-null timestamps.
 *
 * An entry that is not watched can carry a `status` -- `'unseen'` (sure they
 * have not) or `'unsure'` (cannot remember) -- which is what the quick-sort
 * deck's left and down swipes record. A series also carries `episodes`, the
 * 1-based positions ticked off in its episode list. A watched series counts as
 * every episode watched whatever that list says, so a title marked watched from
 * somewhere that does not know its episode count still reads correctly.
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

/** `'watched'`, `'unseen'`, `'unsure'`, or null for a title nobody has sorted. */
export function statusOf(progress, movieId) {
  const entry = progress[movieId]
  if (entry?.watched_at) return 'watched'
  return entry?.status ?? null
}

/** 1..n, the episode list of a fully watched series. */
function allEpisodes(total) {
  return Array.from({ length: total }, (_, index) => index + 1)
}

/** The episodes ticked off, reading a watched series as all of them. */
export function episodesWatched(progress, movieId, total) {
  if (!total) return []
  if (isWatched(progress, movieId)) return allEpisodes(total)
  return (progress[movieId]?.episodes ?? []).filter((n) => n >= 1 && n <= total)
}

/** Some episodes ticked, not all of them. */
export function isInProgress(progress, movieId, total) {
  const count = episodesWatched(progress, movieId, total).length
  return count > 0 && count < total
}

/** True when an entry records nothing at all and can be dropped instead of stored. */
function isEmpty(entry) {
  return (
    !entry.watched_at &&
    !entry.status &&
    entry.rating == null &&
    !entry.notes &&
    !(entry.episodes?.length > 0)
  )
}

/** Write one entry, or delete it when there is nothing left in it. */
function put(next, movieId, entry) {
  if (isEmpty(entry)) {
    if (!(movieId in next)) return
    delete next[movieId]
    write(next, { kind: 'clear', movieId })
  } else {
    next[movieId] = entry
    write(next, { kind: 'set', movieId, entry })
  }
}

/**
 * Toggle watched. `episodeCount` is optional: when given, a series marked
 * watched has every episode ticked in storage as well as on screen.
 */
export function toggleWatched(movieId, episodeCount = 0) {
  const current = read()
  const next = { ...current }

  if (next[movieId]?.watched_at) {
    // Untracking entirely rather than leaving a null timestamp: an un-ticked
    // title goes back to unsorted, not to "unseen", which is a claim the user
    // did not make.
    delete next[movieId]
    write(next, { kind: 'clear', movieId })
    return
  }

  const entry = { ...next[movieId], watched_at: new Date().toISOString(), status: null }
  if (episodeCount > 0) entry.episodes = allEpisodes(episodeCount)
  next[movieId] = entry
  write(next, { kind: 'set', movieId, entry })
}

/**
 * Record a quick-sort verdict: `'watched'`, `'unseen'`, `'unsure'`, or null to
 * forget it. Rating and notes survive; a series' episodes follow the verdict
 * only when it is "watched" (all of them).
 */
export function setStatus(movieId, status, episodeCount = 0) {
  const next = { ...read() }
  const entry = { ...next[movieId] }

  if (status === 'watched') {
    entry.watched_at = entry.watched_at ?? new Date().toISOString()
    entry.status = null
    if (episodeCount > 0) entry.episodes = allEpisodes(episodeCount)
  } else {
    entry.watched_at = null
    entry.status = status ?? null
  }
  put(next, movieId, entry)
}

/**
 * Put an entry back exactly as it was -- the deck's undo. `undefined` means
 * there was no entry, so the title goes back to unsorted.
 */
export function restoreEntry(movieId, entry) {
  const next = { ...read() }
  if (entry === undefined) {
    if (!(movieId in next)) return
    delete next[movieId]
    write(next, { kind: 'clear', movieId })
    return
  }
  next[movieId] = entry
  write(next, { kind: 'set', movieId, entry })
}

/**
 * Replace the ticked episodes of a series with `episodes` (1-based).
 *
 * Ticking the last one marks the series watched; un-ticking any from a watched
 * series un-marks it but keeps the rest. Either way a quick-sort verdict no
 * longer applies once somebody is counting episodes, so it is cleared.
 */
export function setEpisodes(movieId, episodes, total) {
  const next = { ...read() }
  const entry = { ...next[movieId] }
  const ticked = [...new Set(episodes)].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)

  entry.episodes = ticked
  entry.status = null
  entry.watched_at =
    total > 0 && ticked.length === total ? (entry.watched_at ?? new Date().toISOString()) : null
  put(next, movieId, entry)
}

export function toggleEpisode(movieId, episode, total) {
  const current = episodesWatched(read(), movieId, total)
  const has = current.includes(episode)
  setEpisodes(movieId, has ? current.filter((n) => n !== episode) : [...current, episode], total)
}

/** Tick every episode up to and including `episode` -- "I'm up to here". */
export function markEpisodesThrough(movieId, episode, total) {
  setEpisodes(movieId, allEpisodes(Math.min(episode, total)), total)
}

/** `episodeCounts` (id -> count) is optional, as for `toggleWatched`. */
export function markManyWatched(movieIds, episodeCounts = {}) {
  const next = { ...read() }
  const now = new Date().toISOString()
  for (const movieId of movieIds) {
    if (!next[movieId]?.watched_at) {
      next[movieId] = { ...next[movieId], watched_at: now, status: null }
      const count = episodeCounts[movieId]
      if (count > 0) next[movieId].episodes = allEpisodes(count)
    }
  }
  write(next, { kind: 'bulk', movieIds })
}

/** A 1-10 score, or null to take it back. */
export function setRating(movieId, rating) {
  const next = { ...read() }
  next[movieId] = { ...next[movieId], rating }
  write(next, { kind: 'set', movieId, entry: next[movieId] })
}

/**
 * Free-text notes on a title, saved the same way as a rating: optimistic, one
 * `set` delta, rolled back if the server refuses. Blank means "no notes", which
 * is stored as null rather than an empty string so the two cannot drift apart.
 */
export function setNotes(movieId, notes) {
  const trimmed = typeof notes === 'string' ? notes.trim() : ''
  const next = { ...read() }
  next[movieId] = { ...next[movieId], notes: trimmed ? notes : null }
  write(next, { kind: 'set', movieId, entry: next[movieId] })
}

export function clearAll() {
  write({}, { kind: 'reset' })
}

/** How a set of titles splits across the quick-sort verdicts. */
export function sortCounts(progress, movieIds) {
  const counts = { watched: 0, unseen: 0, unsure: 0, unsorted: 0 }
  for (const id of movieIds) counts[statusOf(progress, id) ?? 'unsorted'] += 1
  return counts
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
