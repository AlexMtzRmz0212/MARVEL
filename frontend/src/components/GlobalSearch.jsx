import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'

import { useMovies } from '../api/catalog'
import { year } from '../lib/format'
import { getSnapshot, subscribe } from '../lib/searchTarget'

/**
 * Jump to any title from anywhere in the app.
 *
 * A lens rather than a text field: every other page already has its own way
 * to browse (the catalog's filters, the timeline's graph), so this only
 * needs to answer "where is X", not compete with them for space. Closed, it
 * is a single glyph the same weight as the sign-in control beside it; open,
 * it is a short field and a handful of matches, and nothing else moves.
 */

const RESULT_LIMIT = 8

function LensIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
      <circle cx="6.75" cy="6.75" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const { data: movies } = useMovies()
  const onPage = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const buttonRef = useRef(null)

  // Ctrl/Cmd-F, but only while a page is claiming the lens: everywhere else
  // the page really is text and the browser's find is the better tool, and
  // taking a shortcut people rely on to give them something worse is how you
  // lose their trust in every other shortcut too.
  useEffect(() => {
    if (!onPage) return

    const onFind = (event) => {
      if (event.key !== 'f' || !(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      setOpen(true)
      // Already open with something typed: select it, so a second Ctrl-F
      // starts a fresh search rather than appending to the last one.
      inputRef.current?.select()
    }

    document.addEventListener('keydown', onFind)
    return () => document.removeEventListener('keydown', onFind)
  }, [onPage])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      close()
      // Escape is "give me back what I was doing", so the keyboard goes back
      // there too: to the page if it wants it — the timeline takes it into the
      // graph, where the arrow keys work — and otherwise to the lens itself,
      // which is where it came from. Leaving focus on the panel as it unmounts
      // would drop it on the body, and the next Tab would restart from the top
      // of the document.
      if (onPage?.refocus) onPage.refocus()
      else buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onPage])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function go(movie) {
    close()
    // The page gets first refusal. It declines for anything it cannot show —
    // a title missing from the graph, say — and then this is an ordinary jump
    // to the title's page like anywhere else in the app.
    if (onPage?.find(movie)) return
    navigate(`/movies/${movie.id}`)
  }

  const trimmed = query.trim().toLowerCase()
  const results = trimmed
    ? (movies ?? [])
        .filter((movie) => movie.title.toLowerCase().includes(trimmed))
        .slice(0, RESULT_LIMIT)
    : []

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={onPage ? 'Find a title on this page' : 'Search titles'}
        title={onPage ? 'Find a title on this page (Ctrl-F)' : 'Search titles'}
        className="grid size-7 place-items-center text-ink-faint transition-colors hover:text-ink"
      >
        <LensIcon />
      </button>

      {open && (
        <div className="hairline absolute right-0 top-full z-40 mt-1 w-64 border bg-surface p-2 shadow-lg">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) go(results[0])
            }}
            placeholder={onPage ? 'Find on this page' : 'Search titles'}
            className="hairline w-full border bg-base px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
          />

          {trimmed && (
            <ul className="mt-2 flex flex-col">
              {results.length === 0 && (
                <li className="meta px-1 py-2 text-ink-faint">No matches</li>
              )}
              {results.map((movie) => (
                <li key={movie.id}>
                  <button
                    type="button"
                    onClick={() => go(movie)}
                    className="flex w-full items-baseline justify-between gap-2 px-1 py-1.5 text-left text-sm text-ink transition-colors hover:bg-raised"
                  >
                    <span className="truncate">{movie.title}</span>
                    <span className="meta shrink-0 text-ink-faint">{year(movie.release_date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
