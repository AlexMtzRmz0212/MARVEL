/**
 * Bringing a guest's local data into the account they just signed into.
 *
 * The prompt is not politeness. Signing in on a friend's laptop would otherwise
 * silently upload their orders and viewing history into your account, and there
 * is no undo for that. Asking costs one click on the only occasion it appears.
 */

import { useCallback, useState } from 'react'

import { importLocalData } from '../api/auth'
import { listOrders } from '../lib/orderStorage'
import { getSnapshot as getDisplayMode } from '../lib/watchDisplayPref'
import { getSnapshot as getWatchProgress } from '../lib/watchStorage'

const ORDERS_KEY = 'mcu.custom-orders.v1'
const PROGRESS_KEY = 'mcu.watch-progress.v1'
const DISPLAY_KEY = 'mcu.watched-display.v1'

/** Everything this browser is holding, or null when there is nothing to offer. */
export function collectLocalData() {
  const orders = listOrders()
  const watchProgress = getWatchProgress()

  if (orders.length === 0 && Object.keys(watchProgress).length === 0) return null

  return {
    orders,
    watch_progress: watchProgress,
    preferences: { watched_display_mode: getDisplayMode() },
  }
}

export function clearLocalData() {
  for (const key of [ORDERS_KEY, PROGRESS_KEY, DISPLAY_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // A browser that refuses to clear storage is not worth failing the
      // sign-in over; the server already has the data.
    }
  }
}

/** Human-readable summary of what the server actually accepted. */
export function describeResult(result) {
  const parts = []
  if (result.orders_imported > 0) {
    parts.push(`${result.orders_imported} order${result.orders_imported === 1 ? '' : 's'}`)
  }
  if (result.watch_progress_imported > 0) {
    parts.push(`${result.watch_progress_imported} watched titles`)
  }

  let message = parts.length > 0 ? `Merged ${parts.join(' and ')}.` : 'Nothing new to merge.'

  if (result.orders_renamed?.length > 0) {
    message += ` Renamed ${result.orders_renamed.join(', ')} to avoid a clash.`
  }
  if (result.unknown_movie_ids?.length > 0) {
    message += ` ${result.unknown_movie_ids.length} titles are no longer in the catalog and were skipped.`
  }
  return message
}

/**
 * Drives the prompt. `pending` is non-null only while a decision is outstanding.
 */
export function useMergePrompt() {
  const [pending, setPending] = useState(null)
  const [summary, setSummary] = useState(null)

  const offer = useCallback((payload) => {
    return new Promise((resolve) => {
      setPending({ payload, resolve })
    })
  }, [])

  const accept = useCallback(async () => {
    if (!pending) return
    const { payload, resolve } = pending
    setPending(null)
    try {
      const result = await importLocalData(payload)
      clearLocalData()
      setSummary(describeResult(result))
    } catch (error) {
      setSummary(`Could not merge this browser's data: ${error.message}`)
    }
    resolve()
  }, [pending])

  const decline = useCallback(() => {
    if (!pending) return
    // Declining leaves localStorage alone: the data is still there next time
    // they browse signed out, which is the only sane reading of "keep separate".
    pending.resolve()
    setPending(null)
  }, [pending])

  return {
    pending: pending?.payload ?? null,
    summary,
    offer,
    accept,
    decline,
    dismissSummary: () => setSummary(null),
  }
}
