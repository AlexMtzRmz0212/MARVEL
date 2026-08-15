/**
 * Display preference for watched titles in the catalog grid: fade them in
 * place, or filter them out entirely. Not in the URL — like watch progress
 * itself, it's a personal viewing preference, not something you'd want to share
 * via a link.
 *
 * Same external-store shape as `watchStorage.js`, and the same two backends:
 * localStorage for guests, the account's `preferences` blob once signed in. It
 * arrives free inside GET /api/auth/me, so hydrating it costs no extra request;
 * only writing it needs one.
 */

import { updatePreferences } from '../api/auth'
import { reportSyncError } from './syncStatus'

const STORAGE_KEY = 'mcu.watched-display.v1'
const MODES = ['fade', 'hide']
export const DEFAULT_MODE = 'fade'

// A toggle is one click and the value is tiny, but a user flipping back and
// forth should not queue up a request per flip.
const WRITE_DEBOUNCE_MS = 400

let cache = null
let remote = false
let pendingWrite = null
const listeners = new Set()

function read() {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cache = MODES.includes(raw) ? raw : DEFAULT_MODE
  } catch {
    cache = DEFAULT_MODE
  }
  return cache
}

function notify() {
  for (const listener of listeners) listener()
}

function persist(mode) {
  if (!remote) {
    localStorage.setItem(STORAGE_KEY, mode)
    return
  }

  clearTimeout(pendingWrite)
  pendingWrite = setTimeout(() => {
    updatePreferences({ watched_display_mode: mode }).catch(reportSyncError)
  }, WRITE_DEBOUNCE_MS)
}

function write(next) {
  cache = next
  notify()
  persist(next)
}

export function subscribe(listener) {
  listeners.add(listener)
  // Keep tabs in step: another tab changing the preference should update this
  // one. Inert while signed in, since nothing writes the key then.
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

export function getSnapshot() {
  return read()
}

export function setWatchedDisplayMode(mode) {
  write(MODES.includes(mode) ? mode : DEFAULT_MODE)
}

/**
 * Adopt the account's stored preference and send later changes to the server.
 *
 * An account with no preference set yet keeps whatever the browser was already
 * showing rather than snapping back to the default — the first sign-in then
 * carries the guest's choice up with the rest of the merge.
 */
export function setDisplayPrefBackend(mode, storedMode) {
  remote = mode === 'remote'
  clearTimeout(pendingWrite)
  if (remote) {
    cache = MODES.includes(storedMode) ? storedMode : read()
  } else {
    cache = null
  }
  notify()
}
