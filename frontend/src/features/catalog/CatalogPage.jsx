import { useSearchParams } from 'react-router'

import { useMovies } from '../../api/catalog'
import { TitleCard } from '../../components/TitleCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useWatchedDisplayMode } from '../../hooks/useWatchedDisplayMode'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { setWatchedDisplayMode } from '../../lib/watchDisplayPref'
import { isWatched } from '../../lib/watchStorage'
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
  const visibleMovies =
    watchedDisplayMode === 'hide'
      ? movies?.filter((movie) => !isWatched(watchProgress, movie.id))
      : movies

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
          filters={filters}
          options={options}
          setFilter={setParam}
          reset={resetFilters}
          resultCount={visibleMovies?.length ?? 0}
          totalCount={allMovies?.length ?? 0}
          watchedDisplayMode={watchedDisplayMode}
          setWatchedDisplayMode={setWatchedDisplayMode}
        />
      </div>

      {isPending && <LoadingState label="Loading catalog" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {movies && movies.length === 0 && <EmptyState>No titles match these filters</EmptyState>}

      {movies && movies.length > 0 && visibleMovies.length === 0 && (
        <EmptyState>Every matching title is already watched</EmptyState>
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
