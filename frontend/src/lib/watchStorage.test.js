import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as client from '../api/client'
import { clearSyncError, getSnapshot as getSyncError } from './syncStatus'
import {
  clearAll,
  getSnapshot,
  isWatched,
  markManyWatched,
  progressFor,
  resetToLocalStorage,
  setRating,
  setWatchBackend,
  subscribe,
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
