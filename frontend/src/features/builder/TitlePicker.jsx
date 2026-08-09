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
      <div className="hairline flex items-baseline justify-between border-b pb-2">
        <h2 className="meta">Add titles</h2>
        <span className="meta text-ink-faint/60">{available.length}</span>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="hairline mt-3 w-full border bg-surface px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
      />

      <ul className="mt-3 flex max-h-[28rem] flex-col overflow-y-auto">
        {available.map((movie) => (
          <li key={movie.id}>
            <button
              type="button"
              onClick={() => onAdd(movie.id)}
              className="hairline flex w-full items-center gap-2 border-b px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-surface"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink">{movie.title}</span>
                <span className="meta text-[10px]">
                  {year(movie.release_date)} · {phaseLabel(movie.phase)}
                </span>
              </span>
              <span className="meta shrink-0 text-ink-faint">+</span>
            </button>
          </li>
        ))}
        {available.length === 0 && (
          <li className="meta py-6 text-center">
            {query ? 'Nothing matches' : 'Everything is already in this order'}
          </li>
        )}
      </ul>
    </div>
  )
}
