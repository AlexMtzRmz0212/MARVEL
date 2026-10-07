import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as client from '../api/client'
import { clearSyncError, getSnapshot as getSyncError } from './syncStatus'
import {
  clearAll,
  episodesWatched,
  getSnapshot,
  isInProgress,
  isWatched,
  markEpisodesThrough,
  markManyWatched,
  progressFor,
  resetToLocalStorage,
  restoreEntry,
  setNotes,
  setRating,
  setStatus,
  setWatchBackend,
  sortCounts,
  statusOf,
  subscribe,
  toggleEpisode,
  toggleWatched,
} from './watchStorage'

const STORAGE_KEY = 'mcu.watch-progress.v1'

/** Lets a rejected persist settle before asserting on the rollback. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  localStorage.clear()
  resetToLocalStorage()
  clearSyncError()
  vi.restoreAllMocks()
})

afterEach(() => {
  resetToLocalStorage()
})

describe('guest mode', () => {
  it('writes through to localStorage', () => {
    toggleWatched('iron-man')

    expect(isWatched(getSnapshot(), 'iron-man')).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveProperty('iron-man')
  })

  it('removes the entry rather than nulling the timestamp', () => {
    toggleWatched('iron-man')
    toggleWatched('iron-man')

    // A tracked-but-unwatched row would mean nothing without a watchlist, and
    // the server deletes for the same reason -- the two backends must agree.
    expect(getSnapshot()).not.toHaveProperty('iron-man')
  })

  it('leaves an already-watched title alone when marking many', () => {
    toggleWatched('iron-man')
    const original = getSnapshot()['iron-man'].watched_at

    markManyWatched(['iron-man', 'iron-man-2'])

    expect(getSnapshot()['iron-man'].watched_at).toBe(original)
    expect(isWatched(getSnapshot(), 'iron-man-2')).toBe(true)
  })
})

describe('snapshot contract', () => {
  it('is referentially stable between writes', () => {
    const first = getSnapshot()
    expect(getSnapshot()).toBe(first)

    toggleWatched('iron-man')
    expect(getSnapshot()).not.toBe(first)
  })

  it('notifies subscribers on every write', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    toggleWatched('iron-man')
    setRating('iron-man', 8)
    clearAll()

    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })
})

describe('remote mode', () => {
  it('adopts the hydrated snapshot wholesale', () => {
    toggleWatched('iron-man')

    setWatchBackend('remote', { thor: { watched_at: '2026-01-01T00:00:00Z' } })

    // Signing in must not leave the previous browser's data on screen under
    // the new session.
    expect(getSnapshot()).toEqual({ thor: { watched_at: '2026-01-01T00:00:00Z' } })
  })

  it('sends a delta rather than the whole map', async () => {
    const api = vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', {})

    toggleWatched('iron-man')
    await flush()

    expect(api).toHaveBeenCalledWith(
      '/me/watch-progress/iron-man',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('deletes on untoggle', async () => {
    const api = vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', { 'iron-man': { watched_at: '2026-01-01T00:00:00Z' } })

    toggleWatched('iron-man')
    await flush()

    expect(api).toHaveBeenCalledWith('/me/watch-progress/iron-man', { method: 'DELETE' })
  })

  it('applies the change immediately and rolls back when the write fails', async () => {
    vi.spyOn(client, 'api').mockRejectedValue(new Error('offline'))
    setWatchBackend('remote', {})

    toggleWatched('iron-man')
    // Optimistic: the toggle is visible before the request resolves.
    expect(isWatched(getSnapshot(), 'iron-man')).toBe(true)

    await flush()

    expect(isWatched(getSnapshot(), 'iron-man')).toBe(false)
    expect(getSyncError()).toBe('offline')
  })

  it('stops writing to localStorage', async () => {
    vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', {})

    toggleWatched('iron-man')
    await flush()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('sends rating and notes with the title they belong to', async () => {
    const api = vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', { 'iron-man': { watched_at: '2026-01-01T00:00:00Z' } })

    setRating('iron-man', 9)
    setNotes('iron-man', 'The cave.')
    await flush()

    expect(api).toHaveBeenLastCalledWith('/me/watch-progress/iron-man', {
      method: 'PUT',
      body: { watched_at: '2026-01-01T00:00:00Z', rating: 9, notes: 'The cave.' },
    })
  })

  it('restores the local data on sign-out', async () => {
    toggleWatched('thor')
    vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', { 'iron-man': { watched_at: '2026-01-01T00:00:00Z' } })

    resetToLocalStorage()

    // The account's data must not linger on a shared device, and the guest's
    // own progress is still in localStorage where it was left.
    expect(getSnapshot()).not.toHaveProperty('iron-man')
    expect(isWatched(getSnapshot(), 'thor')).toBe(true)
  })
})

describe('setNotes', () => {
  it('keeps notes beside the watch date in localStorage', () => {
    toggleWatched('thor')
    setNotes('thor', 'Rewatch before Ragnarok.')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(stored.thor.notes).toBe('Rewatch before Ragnarok.')
    expect(isWatched(stored, 'thor')).toBe(true)
  })

  it('stores blank notes as null', () => {
    toggleWatched('thor')
    setNotes('thor', '   ')

    expect(getSnapshot().thor.notes).toBeNull()
  })
})

describe('progressFor', () => {
  it('counts only watched titles', () => {
    markManyWatched(['iron-man', 'thor'])

    expect(progressFor(getSnapshot(), ['iron-man', 'thor', 'hulk'])).toEqual({
      watched: 2,
      total: 3,
      percent: 67,
      remaining: 1,
    })
  })

  it('reports zero rather than dividing by zero', () => {
    expect(progressFor(getSnapshot(), []).percent).toBe(0)
  })
})

describe('quick-sort status', () => {
  it('records unseen and unsure without a watch date', () => {
    setStatus('thor', 'unseen')
    setStatus('hulk', 'unsure')

    expect(statusOf(getSnapshot(), 'thor')).toBe('unseen')
    expect(statusOf(getSnapshot(), 'hulk')).toBe('unsure')
    expect(isWatched(getSnapshot(), 'hulk')).toBe(false)
    expect(statusOf(getSnapshot(), 'iron-man')).toBeNull()
  })

  it('reads a watch date as watched, whatever the status says', () => {
    setStatus('thor', 'unsure')
    setStatus('thor', 'watched')

    expect(statusOf(getSnapshot(), 'thor')).toBe('watched')
    expect(getSnapshot().thor.status).toBeNull()
  })

  it('keeps a rating when the verdict changes', () => {
    setRating('thor', 7)
    setStatus('thor', 'unsure')

    expect(getSnapshot().thor.rating).toBe(7)
  })

  it('drops an entry with nothing left in it', () => {
    setStatus('thor', 'unseen')
    setStatus('thor', null)

    expect(getSnapshot()).not.toHaveProperty('thor')
  })

  it('undoes back to the exact previous entry, or to nothing', () => {
    setRating('thor', 4)
    const before = getSnapshot().thor
    setStatus('thor', 'watched')
    restoreEntry('thor', before)
    expect(getSnapshot().thor).toEqual(before)

    setStatus('hulk', 'unsure')
    restoreEntry('hulk', undefined)
    expect(getSnapshot()).not.toHaveProperty('hulk')
  })

  it('counts every verdict', () => {
    setStatus('a', 'watched')
    setStatus('b', 'unseen')
    setStatus('c', 'unsure')

    expect(sortCounts(getSnapshot(), ['a', 'b', 'c', 'd'])).toEqual({
      watched: 1,
      unseen: 1,
      unsure: 1,
      unsorted: 1,
    })
  })

  it('sends the status to the server with the rest of the entry', async () => {
    const api = vi.spyOn(client, 'api').mockResolvedValue({})
    setWatchBackend('remote', {})

    setStatus('thor', 'unsure')
    await flush()

    expect(api).toHaveBeenCalledWith(
      '/me/watch-progress/thor',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ status: 'unsure', watched_at: null }),
      }),
    )
  })
})

describe('episodes', () => {
  it('ticks episodes one at a time and marks the series on the last', () => {
    toggleEpisode('loki', 1, 3)
    toggleEpisode('loki', 2, 3)
    expect(episodesWatched(getSnapshot(), 'loki', 3)).toEqual([1, 2])
    expect(isInProgress(getSnapshot(), 'loki', 3)).toBe(true)
    expect(isWatched(getSnapshot(), 'loki')).toBe(false)

    toggleEpisode('loki', 3, 3)
    expect(isWatched(getSnapshot(), 'loki')).toBe(true)
    expect(isInProgress(getSnapshot(), 'loki', 3)).toBe(false)
  })

  it('un-ticking one from a watched series keeps the others', () => {
    toggleWatched('loki')
    toggleEpisode('loki', 2, 3)

    expect(isWatched(getSnapshot(), 'loki')).toBe(false)
    expect(episodesWatched(getSnapshot(), 'loki', 3)).toEqual([1, 3])
  })

  it('reads a watched series as every episode even without a stored list', () => {
    toggleWatched('loki')
    expect(episodesWatched(getSnapshot(), 'loki', 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('stores every episode when the count is known', () => {
    toggleWatched('loki', 4)
    expect(getSnapshot().loki.episodes).toEqual([1, 2, 3, 4])

    setStatus('wandavision', 'watched', 2)
    expect(getSnapshot().wandavision.episodes).toEqual([1, 2])
  })

  it('marks every episode up to a point', () => {
    markEpisodesThrough('loki', 4, 6)
    expect(episodesWatched(getSnapshot(), 'loki', 6)).toEqual([1, 2, 3, 4])
  })

  it('clears a quick-sort verdict once episodes are being counted', () => {
    setStatus('loki', 'unseen')
    toggleEpisode('loki', 1, 6)
    expect(statusOf(getSnapshot(), 'loki')).toBeNull()
  })

  it('removes the entry when the last tick is taken back', () => {
    toggleEpisode('loki', 1, 6)
    toggleEpisode('loki', 1, 6)
    expect(getSnapshot()).not.toHaveProperty('loki')
  })
})
