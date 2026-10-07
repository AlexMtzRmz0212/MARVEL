import { useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { clearSyncError, getSnapshot, subscribe } from '../lib/syncStatus'
import { GlobalSearch } from './GlobalSearch'
import { UserMenu } from './UserMenu'

const NAV = [
  // No entry for "/": the wordmark to the left of these is the way home.
  { to: '/catalog', label: 'Catalog' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/compare', label: 'Compare' },
  { to: '/orders', label: 'My orders' },
  { to: '/progress', label: 'Progress' },
  // The one entry that is not always here. Friends is the only feature in the
  // app with no guest half -- a friendship is between two accounts, and a
  // browser holding localStorage is not one of them -- so for a signed-out
  // visitor this would be a nav item leading to a locked door. Every other page
  // works signed out, and the nav should keep saying so.
  { to: '/friends', label: 'Friends', accountOnly: true },
]

// The active stop is underlined in the Infinity yellow, like the lit segment
// of a line diagram over a carriage door. The underline is a border rather
// than `text-decoration` so it sits flush on the band's bottom edge.
function navClass({ isActive }) {
  return [
    'label shrink-0 border-b-[3px] px-2 pt-3 pb-2.5 whitespace-nowrap transition-colors lg:px-3',
    isActive
      ? 'border-infinity text-on-masthead'
      : 'border-transparent text-on-masthead-dim hover:text-on-masthead',
  ].join(' ')
}

function NavLinks() {
  const { user } = useAuth()

  return NAV.filter((item) => !item.accountOnly || user).map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
      {item.label}
    </NavLink>
  ))
}

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
      className="floating bubble bubble-below animate-popup-in fixed inset-x-4 bottom-6 z-40 border-danger sm:inset-x-auto sm:right-6 sm:max-w-sm"
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
    <div className="flex min-h-dvh flex-col bg-paper">
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

          {/* Below `lg` the nav moves to its own row underneath. The logo, the
           * nav items and the account control together need well over 414px of
           * min-content, so on a 320-390px phone a single row cannot fit them.
           * Rendering one nav or the other (rather than reordering a single one
           * with `order`) keeps the focus order matching the visual order in
           * both layouts, and the hidden copy is `display:none`, so assistive
           * tech only ever sees one. The second row scrolls sideways on its
           * own, so the page itself never grows wider than the viewport. */}
          <nav className="hidden items-end gap-1 self-stretch lg:flex" aria-label="Main">
            <NavLinks />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <UserMenu />
          </div>
        </div>

        <nav
          aria-label="Main"
          className="mx-auto flex max-w-[1400px] items-center overflow-x-auto px-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          <NavLinks />
        </nav>
      </header>

      <SyncErrorPopup />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 outline-none sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-4 sm:px-6">
          <p className="meta">Marvel Watch Order</p>
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
    </div>
  )
}
