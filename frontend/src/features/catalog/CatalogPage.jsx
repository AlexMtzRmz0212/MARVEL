import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { useMovies } from '../../api/catalog'
import { TitleCard } from '../../components/TitleCard'
import { useTitlePeek } from '../../hooks/useTitlePeek'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useWatchedDisplayMode } from '../../hooks/useWatchedDisplayMode'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { useSearchClaim } from '../../lib/useSearchClaim'
import { setWatchedDisplayMode } from '../../lib/watchDisplayPref'
import { isWatching, isWatched, needsRewatch, statusOf } from '../../lib/watchStorage'
import { FilterBar } from './FilterBar'

const ORDERS = [
  {
    key: 'release',
    label: 'Release',
    blurb: 'The order it came out, which is the order it was written to be seen in.',
  },
  {
    key: 'chronological',
    label: 'Chronological',
    blurb: 'In-universe timeline. Titles with no agreed placement come last.',
  },
  {
    key: 'title',
    label: 'A-Z',
    blurb: 'Alphabetical, for when you already know what you are looking for.',
  },
]

const ORDER_KEYS = new Set(ORDERS.map((item) => item.key))

const FILTER_KEYS = ['phase', 'saga', 'universe', 'media_type', 'tier', 'q']

/**
 * Filters on the viewer's own quick-sort verdicts. Applied here rather than
 * sent to the API, which knows nothing about who is asking. `unsorted` is the
 * absence of a verdict.
 */
const STATUS_KEYS = new Set(['unsorted', 'unseen', 'unsure', 'watching', 'planned', 'rewatch'])

/** The two main sagas lead; everything else follows alphabetically. */
const SAGA_RANK = { 'Infinity Saga': 0, 'Multiverse Saga': 1 }

function distinct(movies, pick, compare) {
  const values = new Set()
  for (const movie of movies ?? []) {
    const value = pick(movie)
    if (value !== null && value !== undefined && value !== '') values.add(value)
  }
  return [...values].sort(compare)
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const requestedOrder = searchParams.get('order')
  const order = ORDER_KEYS.has(requestedOrder) ? requestedOrder : 'release'
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? null]),
  )

  function setParam(key, value) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === null || value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
        return next
      },
      { replace: true },
    )
  }

  function resetFilters() {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        FILTER_KEYS.forEach((key) => next.delete(key))
        next.delete('status')
        return next
      },
      { replace: true },
    )
  }

  const params = { order, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
  const { data: movies, isPending, error, refetch } = useMovies(params)
  const { data: allMovies } = useMovies({ order })

  const watchProgress = useWatchProgress()
  const watchedDisplayMode = useWatchedDisplayMode()
  const requestedStatus = searchParams.get('status')
  const status = STATUS_KEYS.has(requestedStatus) ? requestedStatus : null
  const visibleMovies = movies?.filter((movie) => {
    // A title marked for rewatching is the one watched title the reader asked
    // to see again, so hiding watched titles must not hide it.
    if (
      watchedDisplayMode === 'hide' &&
      isWatched(watchProgress, movie.id) &&
      !needsRewatch(watchProgress, movie.id)
    )
      return false
    if (status === 'rewatch') return needsRewatch(watchProgress, movie.id)
    if (status === 'watching') {
      return isWatching(watchProgress, movie.id, movie.episode_count > 1 ? movie.episode_count : 0)
    }
    if (status && (statusOf(watchProgress, movie.id) ?? 'unsorted') !== status) return false
    return true
  })

  // The side peek is the app's own (see `TitlePeek`), so it survives a change of
  // filters that would drop the title from the grid, and so does every other
  // page's.
  const { openTitle } = useTitlePeek()
  // Enter pressed in the search. Held as a request rather than acted on at once:
  // the results for what was just typed may still be on their way, and "open the
  // first match" has to mean the first match of *that* search, not of the last.
  const [wantFirst, setWantFirst] = useState(false)
  // Settled during render, which React allows for a component's own state and
  // which avoids a frame of the old panel between the results and the opening.
  if (wantFirst && !isPending && visibleMovies) {
    setWantFirst(false)
    if (visibleMovies[0]) openTitle(visibleMovies[0].id)
  }

  // Ctrl/Cmd-F opens the search bubble rather than the browser's find: the grid
  // is lazily rendered, so browser find only sees what has scrolled past. The
  // bubble flies out of the catalog's own search field and stands in for it --
  // what is typed filters the grid behind it, and a pick opens that title in
  // the side panel.
  useSearchClaim({
    origin: () => document.getElementById('catalog-search'),
    initialQuery: () => filters.q ?? '',
    onQuery: (text) => setParam('q', text.trim()),
    onPick: (movie) => openTitle(movie.id),
    refocus: () => document.getElementById('catalog-search')?.focus(),
  })

  const active = ORDERS.find((item) => item.key === order)

  // Filter choices come from the catalog itself, not a hand-kept list, so a
  // new saga or universe in the seed file shows up here without a code change.
  // The unfiltered list is already fetched for the total count.
  const options = {
    phases: distinct(allMovies, (movie) => movie.phase, (a, b) => a - b),
    sagas: distinct(
      allMovies,
      (movie) => movie.saga,
      (a, b) => (SAGA_RANK[a] ?? 2) - (SAGA_RANK[b] ?? 2) || a.localeCompare(b),
    ),
    universes: distinct(allMovies, (movie) => movie.universe, (a, b) => a.localeCompare(b)),
  }

  return (
    <>
      <div className="flex flex-col gap-4 pt-8 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-5xl text-ink sm:text-6xl">The Marvel catalog</h1>
          <p className="mt-2 max-w-xl text-base text-ink-dim">{active.blurb}</p>
        </div>

        <div className="flex shrink-0 self-start sm:self-auto" role="group" aria-label="Viewing order">
          {ORDERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setParam('order', item.key === 'release' ? null : item.key)}
              aria-pressed={order === item.key}
              className="chip -ml-[2px] min-h-10 px-4 first:ml-0"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pb-4">
        <FilterBar
          filters={{ ...filters, status }}
          options={options}
          setFilter={setParam}
          reset={resetFilters}
          resultCount={visibleMovies?.length ?? 0}
          totalCount={allMovies?.length ?? 0}
          watchedDisplayMode={watchedDisplayMode}
          setWatchedDisplayMode={setWatchedDisplayMode}
          onSearchEnter={() => setWantFirst(true)}
        />
      </div>

      {isPending && <LoadingState label="Loading catalog" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {movies && movies.length === 0 && <EmptyState>No titles match these filters</EmptyState>}

      {movies && movies.length > 0 && visibleMovies.length === 0 && (
        <EmptyState>
          {status ? 'No matching title is sorted that way' : 'Every matching title is already watched'}
        </EmptyState>
      )}

      {visibleMovies && visibleMovies.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visibleMovies.map((movie) => (
            <li key={movie.id} className="[contain-intrinsic-size:auto_420px] [content-visibility:auto]">
              <TitleCard movie={movie} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
