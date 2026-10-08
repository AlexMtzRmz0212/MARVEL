/**
 * "There is a new version."
 *
 * The app is a PWA, so a visitor's browser holds on to the shell it last saw.
 * A new deploy installs in the background and then waits (`registerType:
 * 'prompt'` in vite.config.js); this is the only thing that tells anyone it is
 * there. Tapping Reload activates the waiting worker and reloads the page onto
 * it, so the swap happens when the visitor chooses rather than under their
 * hands mid-scroll.
 *
 * A browser only looks for a new worker when a page loads, which an installed
 * app left open for days never does, so this also asks once an hour and
 * whenever the tab comes back into view.
 */

import { useEffect, useState } from 'react'

const CHECK_EVERY_MS = 60 * 60 * 1000

export function UpdateToast() {
  const [apply, setApply] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // No worker in dev or in an unsupported browser: nothing to wait for.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined

    let cancelled = false
    let timer
    let check = () => {}
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return
        const update = registerSW({
          onNeedRefresh: () => setApply(() => () => update(true)),
          onRegisteredSW: (_url, registration) => {
            if (!registration) return
            // Offline, or mid-deploy: the next check will do, so say nothing.
            check = () => registration.update().catch(() => {})
            timer = setInterval(check, CHECK_EVERY_MS)
            document.addEventListener('visibilitychange', onVisible)
          },
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!apply || dismissed) return null

  return (
    <div
      role="status"
      aria-label="Update available"
      // Above the install card, and lifted clear of the phone tab bar.
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="floating bubble bubble-below animate-popup-in flex w-full max-w-md items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="label text-ink">New version</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-dim">
            Watch Order has been updated. Reload to get the latest.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={apply} className="btn btn-primary btn-sm">
            Reload
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="btn btn-sm">
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
