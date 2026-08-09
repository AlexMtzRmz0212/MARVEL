import { useSyncExternalStore } from 'react'

import { getSnapshot, subscribe } from '../lib/watchStorage'

/**
 * The current watch-progress map, re-rendering every subscriber on change.
 *
 * `useSyncExternalStore` rather than context plus state: localStorage genuinely
 * is an external store, other tabs can write to it, and this is the hook React
 * provides for exactly that shape.
 */
export function useWatchProgress() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
