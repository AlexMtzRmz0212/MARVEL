/**
 * "Put this on your home screen."
 *
 * Installed, the app opens from its own icon with no browser around it, which
 * is most of what separates it from a website in the hand. The two platforms
 * get there differently, so this says the right thing for each:
 *
 * - iOS has no install API at all. Every browser there can add a page to the
 *   home screen from its Share menu, so the card says where to tap.
 * - Chromium (Android, desktop) fires `beforeinstallprompt`, which is held on
 *   to and replayed from an Install button.
 *
 * Two entry points share one store: the card, which offers itself once on a
 * touch screen until dismissed, and the footer link, which is always there
 * (until installed) for whoever dismissed the card and then wanted it back.
 */

import { useSyncExternalStore } from 'react'

const DISMISSED_KEY = 'mcu.install-prompt.dismissed.v1'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(value) {
  try {
    if (value) localStorage.setItem(DISMISSED_KEY, '1')
    else localStorage.removeItem(DISMISSED_KEY)
  } catch {
    // Private mode: the card comes back next visit, which is no worse than that.
  }
}

// Replaced, never mutated, so useSyncExternalStore sees each change.
// `beforeinstallprompt` can fire before React has mounted anything, which is
// why this lives at module scope and the listeners below are registered on
// import rather than in an effect.
let state = { prompt: null, dismissed: typeof window === 'undefined' ? true : readDismissed() }
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppresses Chrome's own mini-infobar: the card below is the prompt.
    event.preventDefault()
    setState({ prompt: event })
  })
  window.addEventListener('appinstalled', () => setState({ prompt: null }))
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getState = () => state
const serverState = { prompt: null, dismissed: true }

function useInstallState() {
  return useSyncExternalStore(subscribe, getState, () => serverState)
}

function dismiss() {
  writeDismissed(true)
  setState({ dismissed: true })
}

async function install(prompt) {
  prompt.prompt()
  const { outcome } = await prompt.userChoice
  // A prompt can be shown once. Either way it is spent; only an accept means
  // there is nothing left to offer.
  setState({ prompt: null })
  if (outcome === 'accepted') dismiss()
}

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

/** The iOS Share glyph: a box with an arrow leaving it. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 16 20"
      aria-label="Share"
      role="img"
      className="inline-block h-[1.1em] w-[0.9em] -translate-y-px align-middle text-ink"
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
  const { prompt, dismissed } = useInstallState()

  if (dismissed || isInstalled() || !window.matchMedia('(pointer: coarse)').matches) return null

  const ios = isIOS()
  if (!ios && !prompt) return null

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
            <>
              <p className="mt-1 text-sm leading-relaxed text-ink-dim">
                Open Watch Order from its own icon, full screen, like any other app:
              </p>
              {/* Newer Safari tucks Share inside the ••• menu rather than on
               * the toolbar, so the steps name both places it can be. */}
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm leading-relaxed text-ink-dim">
                <li>
                  Tap <span className="text-ink">Share</span> <ShareIcon /> (on newer iPhones,
                  tap <span className="text-ink">•••</span> first)
                </li>
                <li>
                  Choose <span className="text-ink">Add to Home Screen</span>
                </li>
              </ol>
            </>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-dim">
              Install Watch Order to open it from its own icon, full screen.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {!ios && (
              <button type="button" onClick={() => install(prompt)} className="btn btn-primary btn-sm">
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

/**
 * The way back to the card once it has been dismissed. On Chromium it skips
 * the card and opens the browser's own install dialog directly; on iOS, where
 * there is no such dialog, it brings the instructions back up.
 */
export function InstallLink({ className }) {
  const { prompt } = useInstallState()

  if (isInstalled()) return null
  const ios = isIOS()
  if (!ios && !prompt) return null

  const onClick = () => {
    if (ios) {
      writeDismissed(false)
      setState({ dismissed: false })
    } else {
      install(prompt)
    }
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      Install the app
    </button>
  )
}
