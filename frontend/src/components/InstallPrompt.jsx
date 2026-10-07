/**
 * "Put this on your home screen."
 *
 * Installed, the app opens from its own icon with no browser around it, which
 * is most of what separates it from a website in the hand. The two platforms
 * get there differently, so this says the right thing for each:
 *
 * - iOS has no install API at all. Every browser there can add a page to the
 *   home screen from its Share menu, so the card says where to tap.
 * - Chromium (Android) fires `beforeinstallprompt`, which is held on to and
 *   replayed from an Install button.
 *
 * Shown only on touch screens, never once installed, and never again once
 * dismissed.
 */

import { useState, useSyncExternalStore } from 'react'

const DISMISSED_KEY = 'mcu.install-prompt.dismissed.v1'

// `beforeinstallprompt` can fire before React has mounted anything, so it is
// caught at module load rather than in an effect, and held here.
let deferredPrompt = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppresses Chrome's own mini-infobar: the card below is the prompt.
    event.preventDefault()
    deferredPrompt = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getDeferredPrompt = () => deferredPrompt

function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  )
}

function isIOS() {
  const { userAgent, platform, maxTouchPoints } = window.navigator
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** The iOS Share glyph: a box with an arrow leaving it. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 16 20"
      aria-hidden="true"
      className="inline-block h-[1.1em] w-[0.9em] -translate-y-px align-middle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 12.5V1.5M4.5 5 8 1.5 11.5 5" />
      <path d="M5.5 8H2.5v10.5h11V8h-3" />
    </svg>
  )
}

export function InstallPrompt() {
  const prompt = useSyncExternalStore(subscribe, getDeferredPrompt, () => null)
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed || isInstalled() || !window.matchMedia('(pointer: coarse)').matches) return null

  const ios = isIOS()
  if (!ios && !prompt) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Private mode: it comes back next visit, which is no worse than that.
    }
  }

  const install = async () => {
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    // A prompt can be shown once. Either way it is spent; only an accept
    // means the card has nothing left to offer.
    deferredPrompt = null
    notify()
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div
      role="region"
      aria-label="Install the app"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="floating bubble bubble-below animate-popup-in flex w-full max-w-md items-start gap-4 px-4 py-3">
        <img src="/apple-touch-icon.png" alt="" className="size-11 shrink-0 border-2 border-ink" />
        <div className="min-w-0 flex-1">
          <p className="label text-ink">Get the app</p>
          {ios ? (
            <p className="mt-1 text-sm leading-relaxed text-ink-dim">
              Tap Share <ShareIcon /> then <span className="text-ink">Add to Home Screen</span> to
              open Watch Order from its own icon, full screen.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-dim">
              Install Watch Order to open it from its own icon, full screen.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {!ios && (
              <button type="button" onClick={install} className="btn btn-primary btn-sm">
                Install
              </button>
            )}
            <button type="button" onClick={dismiss} className="btn btn-sm">
              {ios ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
