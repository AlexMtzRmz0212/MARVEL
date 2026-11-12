import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { useMovies } from '../api/catalog'
import { TitleDrawer } from '../features/catalog/TitleDrawer'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { TitlePeekContext, useTitlePeek } from '../hooks/useTitlePeek'
import {
  isPlanned,
  isWatched,
  isWatching,
  needsRewatch,
  setStatus,
  statusOf,
  toggleWatched,
} from '../lib/watchStorage'

/**
 * Opening a title from anywhere, without leaving where you are.
 *
 * Clicking a poster -- on the catalog, the home page, the deck, a friend's
 * profile -- opens the title in the side peek over the current page; "Open
 * fully" in the peek is the way to its own page. Right-clicking a poster opens a
 * row of status icons instead, so a title can be marked without opening
 * anything.
 *
 * One peek and one menu for the whole app, held here rather than in each page,
 * which is what lets every page offer them by swapping its link for a
 * `TitleLink`. Both close when the route changes, so following "Open fully"
 * (or anything else) never leaves one hanging over the next page.
 */

/** The status menu is this wide and tall, give or take, for keeping it on screen. */
const MENU_WIDTH = 312
const MENU_HEIGHT = 124
const EDGE = 8

export function TitlePeekProvider({ children }) {
  const { data: movies } = useMovies({ order: 'release' })
  const { pathname } = useLocation()
  // Each remembers the page it was opened on: on any other page it is closed,
  // which is "close on navigation" without an effect to do it.
  const [peek, setPeek] = useState(null)
  const [menu, setMenu] = useState(null)
  const returnFocus = useRef(null)

  const peekId = peek?.at === pathname ? peek.id : null
  const menuState = menu?.at === pathname ? menu : null

  function openTitle(id) {
    if (!peekId) returnFocus.current = document.activeElement
    setMenu(null)
    setPeek({ id, at: pathname })
  }

  function closePeek() {
    setPeek(null)
    const back = returnFocus.current
    returnFocus.current = null
    if (back?.isConnected) back.focus?.()
  }

  function openMenu(id, x, y) {
    setMenu({ id, x, y, at: pathname })
  }

  const byId = new Map((movies ?? []).map((movie) => [movie.id, movie]))

  return (
    <TitlePeekContext.Provider value={{ openTitle, openMenu }}>
      {children}
      {peekId && <TitleDrawer movieId={peekId} summary={byId.get(peekId)} onClose={closePeek} />}
      {menuState && (
        <StatusMenu
          key={`${menuState.id}|${menuState.x}|${menuState.y}`}
          movie={byId.get(menuState.id)}
          movieId={menuState.id}
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenu(null)}
        />
      )}
    </TitlePeekContext.Provider>
  )
}

/** A left click with no modifier: the only click that should open the peek. */
function isPlainClick(event) {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}

/**
 * A link to a title that opens the peek instead of the page.
 *
 * Still a real link to `/movies/:id`, so Ctrl/Cmd-click, middle-click and
 * "open in new tab" work as they always did, and so does any browser without
 * the provider around it. A right click opens the status menu.
 */
export function TitleLink({ movieId, onClick, onContextMenu, ...props }) {
  const peek = useTitlePeek()
  return (
    <Link
      to={`/movies/${movieId}`}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || !isPlainClick(event)) return
        event.preventDefault()
        peek.openTitle(movieId)
      }}
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (event.defaultPrevented || !peek.openMenu) return
        event.preventDefault()
        peek.openMenu(movieId, event.clientX, event.clientY)
      }}
    />
  )
}

/* ---- the status menu --------------------------------------------------- */

function Glyph({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  )
}

const WatchedIcon = () => (
  <Glyph>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Glyph>
)
const WatchingIcon = () => (
  <Glyph>
    <path d="M8 5v14l11-7z" fill="currentColor" />
  </Glyph>
)
const WantIcon = () => (
  <Glyph>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
)
const RewatchIcon = () => (
  <Glyph>
    <path d="M19 12a7 7 0 1 1-2.2-5.1" />
    <path d="M19 4v4.5h-4.5" />
  </Glyph>
)
const NotSeenIcon = () => (
  <Glyph>
    <path d="M6 6l12 12M18 6 6 18" />
  </Glyph>
)
const DontRecallIcon = () => (
  <Glyph>
    <path d="M9 9.2a3 3 0 1 1 4.4 2.6c-.9.5-1.4 1.1-1.4 2.2" />
    <path d="M12 17.5v.5" />
  </Glyph>
)

/**
 * The statuses, in the order of the picker. `active` reads the store; `choose`
 * writes it, treating a second press on the lit one as taking it back.
 */
const STATUSES = [
  {
    key: 'watched',
    label: 'Watched',
    Icon: WatchedIcon,
    active: (progress, id) => isWatched(progress, id),
    choose: (id, _active, episodes) => toggleWatched(id, episodes),
  },
  {
    key: 'watching',
    label: 'Watching',
    Icon: WatchingIcon,
    active: (progress, id, total) => isWatching(progress, id, total),
    choose: (id, active) => setStatus(id, active ? null : 'watching'),
  },
  {
    key: 'planned',
    label: 'Want to watch',
    Icon: WantIcon,
    active: (progress, id) => isPlanned(progress, id),
    choose: (id, active) => setStatus(id, active ? null : 'planned'),
  },
  {
    key: 'rewatch',
    label: 'Need to rewatch',
    Icon: RewatchIcon,
    active: (progress, id) => needsRewatch(progress, id),
    choose: (id, active, episodes) => setStatus(id, active ? 'watched' : 'rewatch', episodes),
  },
  {
    key: 'unseen',
    label: 'Not seen',
    Icon: NotSeenIcon,
    active: (progress, id) => statusOf(progress, id) === 'unseen',
    choose: (id, active) => setStatus(id, active ? null : 'unseen'),
  },
  {
    key: 'unsure',
    label: "Don't recall",
    Icon: DontRecallIcon,
    active: (progress, id) => statusOf(progress, id) === 'unsure',
    choose: (id, active) => setStatus(id, active ? null : 'unsure'),
  },
]

function StatusMenu({ movie, movieId, x, y, onClose }) {
  const progress = useWatchProgress()
  const [hint, setHint] = useState(null)
  const barRef = useRef(null)
  const episodes = movie?.episode_count ?? 0
  const total = episodes > 1 ? episodes : 0
  const watched = isWatched(progress, movieId)

  // Keep it on screen however close to an edge it was asked for.
  const left = Math.max(EDGE, Math.min(x, window.innerWidth - MENU_WIDTH - EDGE))
  const top = Math.max(EDGE, Math.min(y, window.innerHeight - MENU_HEIGHT - EDGE))

  useEffect(() => {
    barRef.current?.querySelector('button')?.focus()
  }, [])

  // Capture phase, and stopped there: with the peek also open, Escape closes
  // the menu on top of it and leaves the peek alone.
  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  function onBarKeyDown(event) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const buttons = [...barRef.current.querySelectorAll('button:not(:disabled)')]
    const at = buttons.indexOf(document.activeElement)
    buttons[(at + step + buttons.length) % buttons.length]?.focus()
  }

  return (
    <>
      {/* Anything outside the menu dismisses it; a right click there is
          swallowed rather than stacking the browser's own menu on top. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[60]"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        role="toolbar"
        aria-label={`Set status${movie ? ` for ${movie.title}` : ''}`}
        style={{ left, top, width: MENU_WIDTH }}
        className="floating fixed z-[61] p-2"
      >
        <p className="meta mb-2 truncate px-1">{movie?.title ?? 'Set status'}</p>
        <div ref={barRef} className="flex gap-1" onKeyDown={onBarKeyDown}>
          {STATUSES.map((item) => {
            const { key, label, active, choose } = item
            const pressed = active(progress, movieId, total)
            // Started or wanted is a claim about a title not yet seen.
            const blocked = watched && (key === 'watching' || key === 'planned')
            return (
              <button
                key={key}
                type="button"
                aria-pressed={pressed}
                aria-label={label}
                title={blocked ? 'Already watched' : label}
                disabled={blocked}
                onPointerEnter={() => setHint(label)}
                onPointerLeave={() => setHint(null)}
                onFocus={() => setHint(label)}
                onBlur={() => setHint(null)}
                onClick={() => {
                  choose(movieId, pressed, episodes)
                  onClose()
                }}
                className="grid size-11 flex-1 place-items-center border-2 border-ink bg-surface text-ink transition-colors hover:bg-raised focus-visible:bg-raised disabled:opacity-35 aria-pressed:bg-ink aria-pressed:text-paper"
              >
                <item.Icon />
              </button>
            )
          })}
        </div>
        <p className="meta mt-1.5 h-4 px-1" aria-hidden="true">
          {hint}
        </p>
      </div>
    </>
  )
}
