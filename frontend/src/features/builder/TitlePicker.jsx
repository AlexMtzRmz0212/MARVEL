import { useMemo, useState } from 'react'

import { phaseLabel, year } from '../../lib/format'

/** The pool of titles not yet in the order, searchable. */
export function TitlePicker({ movies, chosenIds, onAdd }) {
  const [query, setQuery] = useState('')

  const available = useMemo(() => {
    const chosen = new Set(chosenIds)
    const needle = query.trim().toLowerCase()
    return movies
      .filter((movie) => !chosen.has(movie.id))
      .filter((movie) => !needle || movie.title.toLowerCase().includes(needle))
  }, [movies, chosenIds, query])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <h2 className="caption caption-corner !mb-1">Add titles</h2>
        <span className="meta text-sm">{available.length}</span>
      </div>

      <label htmlFor="title-picker-search" className="sr-only">
        Search titles to add
      </label>
      <input
        id="title-picker-search"
        type="search"
        name="title"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search titles…"
        autoComplete="off"
        spellCheck={false}
        className="field mt-3"
      />

      <ul className="mt-3 flex max-h-[28rem] flex-col divide-y divide-hairline overflow-y-auto overscroll-contain border-2 border-ink">
        {available.map((movie) => (
          <li key={movie.id}>
            <button
              type="button"
              onClick={() => onAdd(movie.id)}
              aria-label={`Add ${movie.title}`}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{movie.title}</span>
                <span className="meta">
                  {year(movie.release_date)}, {phaseLabel(movie.phase)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-ink text-sm leading-none font-bold text-ink"
              >
                +
              </span>
            </button>
          </li>
        ))}
        {available.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-dim">
            {query ? 'Nothing matches' : 'Everything is already in this order'}
          </li>
        )}
      </ul>
    </div>
  )
}
