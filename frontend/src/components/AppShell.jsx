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

function navClass({ isActive }) {
  return [
    'label shrink-0 px-1.5 py-1.5 whitespace-nowrap transition-colors lg:px-3',
    isActive ? 'text-ink' : 'text-ink-dim hover:text-ink',
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
          className="label shrink-0 text-ink-dim transition-colors hover:text-ink"
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

          {/* Below `lg` the nav moves to its own row underneath. The logo, the
           * nav items and the account control together need well over 414px of
           * min-content, so on a 320-390px phone a single row cannot fit them:
           * the document grew wider than the viewport, which is what let the
           * browser pinch-zoom out past the layout. Rendering one nav or the
           * other (rather than reordering a single one with `order`) keeps the
           * focus order matching the visual order in both layouts, and the
           * hidden copy is `display:none`, so assistive tech only ever sees one.
           *
           * The breakpoint was `md` at five items, where they measured ~430px
           * at the desktop padding. A signed-in visitor now has six, ~515px,
           * which alongside the wordmark, the search lens and the account
           * control no longer clears 768px -- so it is `lg`. Between the two
           * breakpoints the nav simply takes the second row, which it was
           * already built to do.
           *
           * That second row cannot fit six either -- ~440px against a 320px
           * phone -- so it scrolls sideways, and the items refuse to shrink so
           * a label is never squeezed to nothing. The overflow is the nav's
           * own, not the document's, which is the part that mattered: the page
           * itself still never grows wider than the viewport.
           */}
          <nav className="hidden items-center gap-1 lg:flex">
            <NavLinks />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <UserMenu />
          </div>
        </div>

        <nav className="mx-auto -mt-1 flex max-w-[1400px] items-center overflow-x-auto px-2 pb-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          <NavLinks />
        </nav>
      </header>

      <SyncErrorBanner />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 sm:px-6">
        <Outlet />
      </main>

      <footer className="hairline border-t">
        {/* A notch under `.meta` and faded further still: this is the one
         * piece of chrome on every page that nobody is here to read, so it
         * should sit at the very back rather than compete with the page. */}
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-4 text-[0.625rem] opacity-60 sm:px-6">
          <p className="meta text-[0.625rem]">Marvel Watch Order</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legal">
            <Link
              to="/privacy"
              className="label text-[0.6875rem] text-ink-faint transition-colors hover:text-ink-dim"
            >
              Privacy policy
            </Link>
            <Link
              to="/terms"
              className="label text-[0.6875rem] text-ink-faint transition-colors hover:text-ink-dim"
            >
              Terms of service
            </Link>
          </nav>
          <p className="meta w-full text-[0.625rem] text-ink-faint sm:w-auto">
            An unofficial fan project, not affiliated with Marvel or Disney.
          </p>
        </div>
      </footer>
    </div>
  )
}
