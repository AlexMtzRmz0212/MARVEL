import { useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { clearSyncError, getSnapshot, subscribe } from '../lib/syncStatus'
import { UserMenu } from './UserMenu'

const NAV = [
  // `end` because "/" prefix-matches every route, which would otherwise leave
  // Catalog highlighted on every page.
  { to: '/', label: 'Catalog', end: true },
  { to: '/timeline', label: 'Timeline' },
  { to: '/orders', label: 'My orders' },
  { to: '/progress', label: 'Progress' },
]

function navClass({ isActive }) {
  return [
    'meta px-1.5 py-1.5 transition-colors sm:px-3',
    isActive ? 'text-ink' : 'text-ink-dim hover:text-ink',
  ].join(' ')
}

function NavLinks() {
  return NAV.map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
      {item.label}
    </NavLink>
  ))
}

/**
 * Optimistic writes roll back silently when the server refuses them, which
 * looks like a toggle undoing itself. This says what happened.
 */
function SyncErrorBanner() {
  const message = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (!message) return null

  return (
    <div className="hairline border-b border-l-2 border-l-danger bg-surface">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2 sm:px-6">
        <p className="flex-1 text-sm text-ink-dim">{message}</p>
        <button
          type="button"
          onClick={clearSyncError}
          className="meta shrink-0 text-ink-dim transition-colors hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="hairline sticky top-0 z-30 border-b bg-base/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-ink">
              MARVEL
            </span>
            <span className="meta hidden sm:inline">Watch Order</span>
          </NavLink>

          {/* Below `sm` the nav moves to its own row underneath. The logo, the
           * four nav items and the account control together need well over
           * 414px of min-content, so on a 320-390px phone a single row cannot
           * fit them: the document grew wider than the viewport, which is what
           * let the browser pinch-zoom out past the layout. Rendering one nav or
           * the other (rather than reordering a single one with `order`) keeps
           * the focus order matching the visual order in both layouts, and the
           * hidden copy is `display:none`, so assistive tech only ever sees one.
           *
           * The second row is tight too: four labels at the desktop padding
           * measure ~333px, so below `sm` the items and the row itself both
           * lose a step of horizontal padding. That keeps the row inside 320px
           * rather than scrolling or clipping the last tab.
           */}
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLinks />
          </nav>

          <UserMenu />
        </div>

        <nav className="mx-auto -mt-1 flex max-w-[1400px] items-center px-2 pb-2 sm:hidden">
          <NavLinks />
        </nav>
      </header>

      <SyncErrorBanner />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 sm:px-6">
        <Outlet />
      </main>

      <footer className="hairline border-t">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 sm:px-6">
          <p className="meta">Marvel Watch Order</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
            <Link
              to="/privacy"
              className="meta text-ink-dim transition-colors hover:text-ink"
            >
              Privacy policy
            </Link>
            <Link to="/terms" className="meta text-ink-dim transition-colors hover:text-ink">
              Terms of service
            </Link>
          </nav>
          <p className="meta w-full text-ink-dim sm:w-auto">
            An unofficial fan project, not affiliated with Marvel or Disney.
          </p>
        </div>
      </footer>
    </div>
  )
}
