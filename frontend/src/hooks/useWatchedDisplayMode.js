import { useSyncExternalStore } from 'react'

import { getSnapshot, subscribe } from '../lib/watchDisplayPref'

/** 'fade' or 'hide' — how the catalog grid treats titles already watched. */
export function useWatchedDisplayMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
