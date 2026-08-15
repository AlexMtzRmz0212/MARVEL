/**
 * The last failed write to the server, if any.
 *
 * Writes to watch progress and the display preference are optimistic: the UI
 * updates first and the request follows. When one fails the store rolls back,
 * which the user sees as a toggle silently flipping itself — confusing unless
 * something says why. This is that something.
 *
 * Same external-store shape as the storage modules, so the banner subscribes
 * with `useSyncExternalStore` like everything else.
 */

let message = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return message
}

export function reportSyncError(error) {
  message = error?.message || 'That change could not be saved.'
  notify()
}

export function clearSyncError() {
  if (message === null) return
  message = null
  notify()
}
