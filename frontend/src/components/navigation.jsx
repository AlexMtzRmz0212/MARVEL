import { Link, useLocation } from 'react-router'

import { useAuth } from '../auth/AuthContext'

/**
 * The app's map: one flat row of tabs, one per page.
 *
 * Every URL is unchanged, so no bookmark, share link or test that names one has
 * to move. `owns` lists the routes a tab stays lit for -- a title opened from
 * the catalog, a saved order under Orders -- so the tab you came *from* still
 * reads as current.
 */
const TABS = [
  { to: '/catalog', label: 'Catalog', owns: ['/catalog', '/movies'], Icon: BrowseIcon },
  { to: '/timeline', label: 'Timeline', owns: ['/timeline'], Icon: TimelineIcon },
  { to: '/orders', label: 'Orders', owns: ['/orders'], Icon: OrdersIcon },
  { to: '/compare', label: 'Release vs story', short: 'Compare', owns: ['/compare'], Icon: CompareIcon },
  { to: '/progress', label: 'Progress', owns: ['/progress'], Icon: ProgressIcon, exact: true },
  { to: '/progress/sort', label: 'Quick sort', owns: ['/progress/sort'], Icon: SortIcon },
  // Friends is the one feature with no guest half -- a friendship is between
  // two accounts -- so a signed-out visitor is not shown a tab that leads to a
  // locked door.
  { to: '/friends', label: 'Friends', owns: ['/friends'], Icon: FriendsIcon, accountOnly: true },
]

function owns(tab, pathname) {
  if (tab.exact) return pathname === tab.to
  return tab.owns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Tabs this visitor can use, and the one the current page belongs to (or null). */
function useTabs() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const tabs = TABS.filter((tab) => !tab.accountOnly || user)
  // /progress/sort is its own tab, so Progress must not claim it.
  const current = tabs.find((tab) => owns(tab, pathname)) ?? null
  return { tabs, current, pathname }
}

/** "page" on the tab's own landing page, "true" anywhere else inside it. */
function currentness(active, to, pathname) {
  if (!active) return undefined
  return pathname === to ? 'page' : 'true'
}

/**
 * Masthead links, desktop only. The wordmark beside them is the way home.
 * The active stop is underlined in the Infinity yellow, like the lit segment of
 * a line diagram over a carriage door.
 */
export function SectionLinks() {
  const { tabs, current, pathname } = useTabs()
  return tabs.map((tab) => (
    <Link
      key={tab.to}
      to={tab.to}
      aria-current={currentness(current === tab, tab.to, pathname)}
      className={[
        'label shrink-0 border-b-[3px] px-3 pt-3 pb-2.5 whitespace-nowrap transition-colors',
        current === tab
          ? 'border-infinity text-on-masthead'
          : 'border-transparent text-on-masthead-dim hover:text-on-masthead',
      ].join(' ')}
    >
      {tab.label}
    </Link>
  ))
}

/**
 * The phone's tab bar: home plus every tab, where a thumb can reach them, as an
 * installed app would have it. Fixed to the bottom edge and padded clear of the
 * home indicator. Eight stops are more than fit across a phone, so the row
 * scrolls sideways and the current tab is kept in view.
 */
export function BottomTabBar() {
  const { tabs, current, pathname } = useTabs()
  const items = [{ to: '/', label: 'Home', Icon: HomeIcon, home: true }, ...tabs]

  return (
    <nav
      aria-label="Main"
      data-bottom-bar
      className="masthead fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.home ? pathname === '/' : current === item
          return (
            <li key={item.to} className="min-w-[4.5rem] flex-1">
              <Link
                to={item.to}
                aria-current={currentness(active, item.to, pathname)}
                ref={active ? scrollIntoViewHorizontally : undefined}
                className={[
                  'flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] px-1 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase transition-colors',
                  active
                    ? 'border-infinity text-on-masthead'
                    : 'border-transparent text-on-masthead-dim hover:text-on-masthead',
                ].join(' ')}
              >
                <item.Icon className="size-6" />
                {item.short ?? item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Keep the lit tab on screen when the bar is scrolled; no vertical movement. */
function scrollIntoViewHorizontally(node) {
  node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function Glyph({ className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  )
}

function HomeIcon({ className }) {
  return (
    <Glyph className={className}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </Glyph>
  )
}

/** A rack of posters. */
function BrowseIcon({ className }) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="5" height="16" />
      <rect x="9.5" y="4" width="5" height="16" />
      <path d="m16.5 5 4 .9-3.3 14.7-3.9-.9" />
    </Glyph>
  )
}

/** Stations along a line: an order. */
function OrdersIcon({ className }) {
  return (
    <Glyph className={className}>
      <path d="M6 4v16" />
      <circle cx="6" cy="6" r="2.2" fill="currentColor" />
      <circle cx="6" cy="12" r="2.2" fill="currentColor" />
      <circle cx="6" cy="18" r="2.2" fill="currentColor" />
      <path d="M11 6h10M11 12h10M11 18h7" />
    </Glyph>
  )
}

/** A check in a frame: what has been seen. */
function ProgressIcon({ className }) {
  return (
    <Glyph className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="m7.5 12.5 3 3 6-7" />
    </Glyph>
  )
}

/** A line with a few events pinned along it. */
function TimelineIcon({ className }) {
  return (
    <Glyph className={className}>
      <path d="M3 12h18" />
      <circle cx="7" cy="12" r="2.2" fill="currentColor" />
      <circle cx="14" cy="12" r="2.2" fill="currentColor" />
      <path d="M7 6v4M14 14v4M20 8v4" />
    </Glyph>
  )
}

/** Two columns set side by side. */
function CompareIcon({ className }) {
  return (
    <Glyph className={className}>
      <path d="M8 4v16M16 4v16" />
      <path d="M4 8h4M4 14h4M16 10h4M16 16h4" />
    </Glyph>
  )
}

/** Bars of different lengths, in order. */
function SortIcon({ className }) {
  return (
    <Glyph className={className}>
      <path d="M4 6h16M4 12h11M4 18h6" />
    </Glyph>
  )
}

/** Two people. */
function FriendsIcon({ className }) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3.2 2.4-5 5.5-5s5.5 1.8 5.5 5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.7 2.5 2.2 2.5 4.6" />
    </Glyph>
  )
}
