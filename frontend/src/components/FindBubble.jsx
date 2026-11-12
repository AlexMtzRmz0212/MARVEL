import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { year } from '../lib/format'

/**
 * The search bubble: a speech bubble that flies out of whatever the reader was
 * pointing at -- the page's search field, or the lens in the header -- and
 * lands in the middle of the screen.
 *
 * The input row sits on the viewport's centre line and the matches hang below
 * it, so typing never moves the thing being typed in. The tail points back at
 * where the bubble came from.
 *
 * It only finds a title; what a pick *does* belongs to the page. By default a
 * pick is handed to `onPick` and the bubble closes. With `renderPicked` the
 * bubble stays open and shows what that returns in place of the list -- the
 * orders and progress pages use it to say where a title sits.
 */

const RESULT_LIMIT = 8

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function FindBubble({
  movies,
  origin,
  placeholder = 'Search titles…',
  label = 'Search titles',
  initialQuery = '',
  onQuery,
  onPick,
  renderPicked,
  onClose,
}) {
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState(null)
  // Which edge the tail grows from: the bubble points back at where it came from.
  const [tail, setTail] = useState('up')
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  const trimmed = query.trim().toLowerCase()
  const results = useMemo(
    () =>
      trimmed
        ? (movies ?? []).filter((movie) => movie.title.toLowerCase().includes(trimmed)).slice(0, RESULT_LIMIT)
        : [],
    [movies, trimmed],
  )

  // Fly in from the origin. Measured before paint, so the first frame the
  // reader sees is already the bubble at the origin rather than a flash of it
  // in the middle.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || !origin) return
    const to = center(panel.getBoundingClientRect())
    const from = center(origin.getBoundingClientRect())
    setTail(from.y > to.y + 8 ? 'down' : 'up')
    if (prefersReducedMotion() || !panel.animate) return
    panel.animate(
      [
        {
          transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(0.12)`,
          opacity: 0,
        },
        { opacity: 1, offset: 0.35 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration: 340, easing: 'cubic-bezier(0.2, 1.25, 0.35, 1)' },
    )
  }, [origin])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function change(value) {
    setQuery(value)
    setActive(0)
    onQuery?.(value)
  }

  function pick(movie) {
    if (renderPicked) {
      setPicked(movie)
      return
    }
    onPick?.(movie)
    onClose('pick')
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose('escape')
      return
    }
    // Keep Tab inside the bubble: behind the backdrop there is nothing to reach.
    if (event.key === 'Tab') {
      const focusable = [
        ...(panelRef.current?.querySelectorAll('input, button, a[href]') ?? []),
      ].filter((element) => !element.disabled)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  function onInputKeyDown(event) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      setActive((value) => (value + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault()
      setActive((value) => (value - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      pick(results[active])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/45"
        onPointerDown={() => onClose('dismiss')}
      />

      {/* The input row is centred on the viewport; everything else hangs below. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -mt-7 flex justify-center px-4">
        <div
          ref={panelRef}
          className={[
            'floating bubble bubble-center pointer-events-auto w-[min(26rem,100%)] p-2.5 text-ink',
            tail === 'down' ? 'bubble-below' : '',
          ].join(' ')}
        >
          {picked ? (
            <div>
              {renderPicked(picked, { close: () => onClose('pick') })}
              <button
                type="button"
                className="btn btn-sm mt-2 w-full"
                onClick={() => {
                  setPicked(null)
                  window.requestAnimationFrame(() => inputRef.current?.select())
                }}
              >
                Search again
              </button>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                data-find-input
                type="search"
                name="title"
                value={query}
                onChange={(event) => change(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={placeholder}
                aria-label={label}
                autoComplete="off"
                spellCheck={false}
                className="field"
              />

              {trimmed && (
                <ul className="mt-2 flex max-h-[min(22rem,calc(50dvh-3rem))] flex-col overflow-y-auto">
                  {results.length === 0 && <li className="meta px-2 py-2">No matches</li>}
                  {results.map((movie, index) => (
                    <li key={movie.id}>
                      <button
                        type="button"
                        onClick={() => pick(movie)}
                        onPointerEnter={() => setActive(index)}
                        className={[
                          'flex w-full items-center gap-3 px-2 py-1.5 text-left text-sm font-medium text-ink transition-colors',
                          index === active ? 'bg-raised' : '',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden="true"
                          className="aspect-[2/3] w-7 shrink-0 border-2 border-ink bg-raised"
                        >
                          {movie.poster_url && (
                            <img
                              src={movie.poster_url}
                              alt=""
                              width={500}
                              height={750}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{movie.title}</span>
                        <span className="meta shrink-0">{year(movie.release_date)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
