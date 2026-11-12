import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'

import { useMovies } from '../api/catalog'
import { getSnapshot, subscribe } from '../lib/searchTarget'
import { FindBubble } from './FindBubble'

/**
 * Jump to any title from anywhere in the app.
 *
 * A lens rather than a text field: every other page already has its own way
 * to browse (the catalog's filters, the timeline's graph), so this only
 * needs to answer "where is X". Closed, it is a single glyph the same weight as
 * the sign-in control beside it. Open, it is the `FindBubble`, which flies out
 * of the page's own search field if the page has one and out of this lens if
 * not.
 *
 * What a pick does is up to the page that claimed the lens (see
 * `lib/searchTarget`); with no claim it opens the title's page.
 */

function LensIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
      <circle cx="6.75" cy="6.75" r="4.75" stroke="currentColor" strokeWidth="2" />
      <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Whether an element is on screen, so the bubble never flies in from nowhere. */
function visible(element) {
  if (!element?.isConnected) return false
  const rect = element.getBoundingClientRect()
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  )
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const { data: movies } = useMovies()
  const onPage = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(null)
  const buttonRef = useRef(null)

  function openBubble() {
    const preferred = onPage?.origin?.()
    setOrigin(visible(preferred) ? preferred : buttonRef.current)
    setOpen(true)
  }

  // Ctrl/Cmd-F, but only while a page is claiming the lens: everywhere else
  // the page really is text and the browser's find is the better tool, and
  // taking a shortcut people rely on to give them something worse is how you
  // lose their trust in every other shortcut too.
  useEffect(() => {
    if (!onPage) return

    const onFind = (event) => {
      if (event.key !== 'f' || !(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      // Already open: select what is typed, so a second Ctrl-F starts a fresh
      // search rather than appending to the last one.
      if (open) document.querySelector('[data-find-input]')?.select()
      else openBubble()
    }

    document.addEventListener('keydown', onFind)
    return () => document.removeEventListener('keydown', onFind)
    // `openBubble` reads the claim and the lens, both of which this effect
    // already depends on or that are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPage, open])

  function close(reason) {
    setOpen(false)
    // Escape is "give me back what I was doing", so the keyboard goes back
    // there too: to the page if it wants it — the timeline takes it into the
    // graph, where the arrow keys work — and otherwise to the lens itself,
    // which is where it came from. Leaving focus on the bubble as it unmounts
    // would drop it on the body, and the next Tab would restart from the top
    // of the document.
    if (reason !== 'escape') return
    if (onPage?.refocus) onPage.refocus()
    else buttonRef.current?.focus()
  }

  function go(movie) {
    // The page gets first refusal. `find` declines for anything it cannot show
    // — a title missing from the graph, say — and then this is an ordinary jump
    // to the title's page like anywhere else in the app.
    if (onPage?.find?.(movie)) return
    if (onPage?.onPick) {
      onPage.onPick(movie)
      return
    }
    navigate(`/movies/${movie.id}`)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close('dismiss') : openBubble())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={onPage ? 'Find a title on this page' : 'Search titles'}
        title={onPage ? 'Find a title on this page (Ctrl-F)' : 'Search titles'}
        className="grid size-9 place-items-center text-on-masthead-dim transition-colors hover:text-on-masthead"
      >
        <LensIcon />
      </button>

      {/* Portalled to the body: the masthead is its own stacking context, and
          the tab bar along the bottom would otherwise sit on top of the dimming. */}
      {open &&
        createPortal(
          <FindBubble
            movies={movies}
            origin={origin}
            label={onPage ? 'Find a title on this page' : 'Search titles'}
            placeholder={onPage ? 'Find on this page…' : 'Search titles…'}
            initialQuery={onPage?.initialQuery?.() ?? ''}
            onQuery={onPage?.onQuery}
            onPick={go}
            renderPicked={onPage?.renderPicked}
            onClose={close}
          />,
          document.body,
        )}
    </div>
  )
}
