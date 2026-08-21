import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useMovies } from '../api/catalog'
import { year } from '../lib/format'

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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function go(movie) {
    close()
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
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Search titles"
        title="Search titles"
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
            placeholder="Search titles"
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
