/**
 * Display preference for watched titles in the catalog grid: fade them in
 * place, or filter them out entirely. Persisted in localStorage rather than
 * the URL — like watch progress itself, it's a personal viewing preference,
 * not something you'd want to share via a link.
 *
 * Same external-store shape as `watchStorage.js` for the same reason: other
 * tabs can write this, and `useSyncExternalStore` is the hook for that.
 */

const STORAGE_KEY = 'mcu.watched-display.v1'
const MODES = ['fade', 'hide']
export const DEFAULT_MODE = 'fade'

let cache = null
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

function write(next) {
  cache = next
  localStorage.setItem(STORAGE_KEY, next)
  for (const listener of listeners) listener()
}

export function subscribe(listener) {
  listeners.add(listener)
  // Keep tabs in step: another tab changing the preference should update this one.
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
