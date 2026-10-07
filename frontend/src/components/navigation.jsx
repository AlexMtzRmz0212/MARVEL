import { Link, NavLink, useLocation } from 'react-router'

import { useAuth } from '../auth/AuthContext'

/**
 * The app's map: three sections, each owning a handful of pages.
 *
 * Six destinations in one row of tabs had stopped fitting anywhere -- a
 * sideways-scrolling second row on a phone, a crowded masthead on a laptop --
 * and the six were never equals anyway: the timeline is another way of looking
 * at the catalog, the comparison is a question about orders, friends are about
 * progress. So the top level is the three questions the app answers (what is
 * there, what order, how far am I), and each page within one is a tab of it.
 *
 * Every URL is unchanged. Sections are a grouping over routes that already
 * exist, so no bookmark, share link or test that names one has to move.
 */
const SECTIONS = [
  {
    to: '/catalog',
    label: 'Browse',
    owns: ['/catalog', '/timeline', '/movies'],
    Icon: BrowseIcon,
    tabs: [
      { to: '/catalog', label: 'Catalog' },
      { to: '/timeline', label: 'Timeline' },
    ],
  },
  {
    to: '/orders',
    label: 'Orders',
    owns: ['/orders', '/compare'],
    Icon: OrdersIcon,
    tabs: [
      { to: '/orders', label: 'Orders' },
      { to: '/compare', label: 'Release vs story' },
    ],
  },
  {
    to: '/progress',
    label: 'Progress',
    owns: ['/progress', '/friends'],
    Icon: ProgressIcon,
    tabs: [
      { to: '/progress', label: 'Overview' },
      { to: '/progress/sort', label: 'Quick sort' },
      // Friends is the one feature with no guest half -- a friendship is
      // between two accounts -- so a signed-out visitor is not shown a tab
      // that leads to a locked door.
      { to: '/friends', label: 'Friends', accountOnly: true },
    ],
  },
]

function owns(section, pathname) {
  return section.owns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** The section the current page belongs to, or null (home, legal, sign-in). */
function useSection() {
  const { pathname } = useLocation()
  return SECTIONS.find((section) => owns(section, pathname)) ?? null
}

/**
 * Masthead links, desktop only. The wordmark beside them is the way home.
 * The active stop is underlined in the Infinity yellow, like the lit segment of
 * a line diagram over a carriage door.
 */
/** "page" on the section's own landing page, "true" anywhere else inside it. */
function currentness(active, to, pathname) {
  if (!active) return undefined
  return pathname === to ? 'page' : 'true'
}

export function SectionLinks() {
  const current = useSection()
  const { pathname } = useLocation()
  return SECTIONS.map((section) => (
    <Link
      key={section.to}
      to={section.to}
      aria-current={currentness(current === section, section.to, pathname)}
      className={[
        'label shrink-0 border-b-[3px] px-3 pt-3 pb-2.5 whitespace-nowrap transition-colors',
        current === section
          ? 'border-infinity text-on-masthead'
          : 'border-transparent text-on-masthead-dim hover:text-on-masthead',
      ].join(' ')}
    >
      {section.label}
    </Link>
  ))
}

/**
 * The phone's tab bar: the same three sections plus home, where a thumb can
 * reach them, as an installed app would have it. Fixed to the bottom edge and
 * padded clear of the home indicator.
 */
export function BottomTabBar() {
  const current = useSection()
  const { pathname } = useLocation()
  const items = [{ to: '/', label: 'Home', Icon: HomeIcon, home: true }, ...SECTIONS]

  return (
    <nav
      aria-label="Main"
      data-bottom-bar
      className="masthead fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const active = item.home ? pathname === '/' : current === item
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={currentness(active, item.to, pathname)}
                className={[
                  'flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] text-[11px] font-bold tracking-wide uppercase transition-colors',
                  active
                    ? 'border-infinity text-on-masthead'
                    : 'border-transparent text-on-masthead-dim hover:text-on-masthead',
                ].join(' ')}
              >
                <item.Icon className="size-6" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * The pages of the current section, as a row of tabs at the top of the page.
 * Shown only on a section's own pages -- not on a title, a saved order or a
 * friend's profile, which are places you went *from* a tab, with their own way
 * back.
 */
export function SectionTabs() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const section = useSection()
  if (!section) return null

  const tabs = section.tabs.filter((tab) => !tab.accountOnly || user)
  if (!tabs.some((tab) => tab.to === pathname)) return null

  return (
    <nav aria-label={section.label} className="pt-4 sm:pt-6">
      <div
        className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              [
                'chip -ml-[2px] min-h-9 shrink-0 px-4 first:ml-0',
                isActive ? '!bg-ink !text-paper' : '',
              ].join(' ')
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
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
