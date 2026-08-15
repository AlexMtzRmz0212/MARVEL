import { useSyncExternalStore } from 'react'
import { NavLink, Outlet } from 'react-router'

import { clearSyncError, getSnapshot, subscribe } from '../lib/syncStatus'
import { UserMenu } from './UserMenu'

const NAV = [
  // `end` because "/" prefix-matches every route, which would otherwise leave
  // Catalog highlighted on every page.
  { to: '/', label: 'Catalog', end: true },
  { to: '/orders', label: 'My orders' },
  { to: '/progress', label: 'Progress' },
]

function navClass({ isActive }) {
  return [
    'meta px-3 py-1.5 transition-colors',
    isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
  ].join(' ')
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
          className="meta shrink-0 text-ink-faint transition-colors hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh bg-base">
      <header className="hairline sticky top-0 z-30 border-b bg-base/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-ink">
              MARVEL
            </span>
            <span className="meta hidden sm:inline">Watch Order</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <UserMenu />
        </div>
      </header>

      <SyncErrorBanner />

      <main className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
