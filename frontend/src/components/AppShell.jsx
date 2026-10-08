import { useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { clearSyncError, getSnapshot, subscribe } from '../lib/syncStatus'
import { GlobalSearch } from './GlobalSearch'
import { InstallLink, InstallPrompt } from './InstallPrompt'
import { BottomTabBar, SectionLinks, SectionTabs } from './navigation'
import { UpdateToast } from './UpdateToast'
import { UserMenu } from './UserMenu'

/**
 * Optimistic writes roll back silently when the server refuses them, which
 * looks like a toggle undoing itself. This says what happened.
 *
 * A floating popup rather than a banner in the document flow: a banner above
 * `<main>` pushes every page's content down the moment a write fails, which
 * moves whatever the user was just looking at. Fixed positioning says the
 * same thing without relocating anything else on the page.
 */
function SyncErrorPopup() {
  const message = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (!message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="floating bubble bubble-below animate-popup-in fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] border-danger sm:inset-x-auto sm:right-6 sm:max-w-sm"
    >
      <div className="flex items-start gap-4 px-4 py-3">
        <p className="flex-1 text-sm leading-relaxed text-ink">{message}</p>
        <button type="button" onClick={clearSyncError} className="btn btn-sm shrink-0">
          Dismiss
        </button>
      </div>
    </div>
  )
}

/** The route mark: two lines cased in ink meeting at a station, as in the favicon. */
function RouteMark() {
  return (
    <svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 shrink-0" fill="none">
      <path d="M3 4 L16 10" stroke="var(--color-on-masthead)" strokeWidth="5" strokeLinecap="round" />
      <path d="M3 16 L16 10" stroke="var(--color-on-masthead)" strokeWidth="5" strokeLinecap="round" />
      <path d="M3 4 L16 10" stroke="var(--color-infinity)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M3 16 L16 10" stroke="var(--color-multiverse)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="18" cy="10" r="5" fill="var(--color-masthead)" stroke="var(--color-on-masthead)" strokeWidth="2.2" />
    </svg>
  )
}

/**
 * Print out of register: the red, green and blue of whatever this is applied
 * to are separated and nudged a few pixels apart, like three inks laid down
 * slightly off. Defined once here and referenced from CSS as
 * `url(#misregister)`.
 */
function MisregisterFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="misregister" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
        <feOffset in="red" dx="-4" dy="1" result="red-off" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
        <feOffset in="blue" dx="4" dy="-1" result="blue-off" />
        <feBlend in="red-off" in2="green" mode="screen" result="red-green" />
        <feBlend in="red-green" in2="blue-off" mode="screen" />
      </filter>
    </svg>
  )
}

export function AppShell() {
  return (
    // The side insets are the landscape notch on an installed iPhone; they are
    // zero in a browser and on any screen without a notch.
    <div className="flex min-h-dvh flex-col bg-paper pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <MisregisterFilter />
      <a
        href="#main"
        className="btn btn-primary sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="masthead sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 py-2.5" aria-label="Marvel Watch Order, home">
            <RouteMark />
            <span translate="no" className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-on-masthead-dim">Marvel</span>
              <span className="display text-xl text-on-masthead">Watch order</span>
            </span>
          </NavLink>

          {/* Below `lg` the sections move to the tab bar along the bottom
           * edge, where a thumb reaches them, and the masthead keeps one row.
           * One nav or the other is `display:none`, so assistive tech only
           * ever meets one "Main" landmark. */}
          <nav className="hidden items-end gap-1 self-stretch lg:flex" aria-label="Main">
            <SectionLinks />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <UserMenu />
          </div>
        </div>
      </header>

      <SyncErrorPopup />
      <InstallPrompt />
      <UpdateToast />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 outline-none sm:px-6">
        <SectionTabs />
        <Outlet />
      </main>

      {/* On a phone the footer also makes room for the tab bar, so its last
          line is never under it -- and pages that size themselves to "the
          space above the footer", like the timeline, stop at the bar too. */}
      <footer className="border-t-2 border-ink pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-4 sm:px-6">
          <p className="meta">Marvel Watch Order</p>
          <InstallLink className="meta cursor-pointer underline-offset-4 transition-colors hover:text-ink hover:underline" />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legal">
            <Link
              to="/privacy"
              className="meta underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Privacy policy
            </Link>
            <Link
              to="/terms"
              className="meta underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Terms of service
            </Link>
          </nav>
          <p className="meta w-full sm:ml-auto sm:w-auto">
            An unofficial fan project, not affiliated with Marvel or Disney.
          </p>
        </div>
      </footer>

      <BottomTabBar />
    </div>
  )
}
