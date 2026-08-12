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
]

const FILTER_KEYS = ['phase', 'saga', 'media_type', 'tier', 'q']

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const order = searchParams.get('order') === 'chronological' ? 'chronological' : 'release'
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

  return (
    <>
      <div className="hairline flex flex-col gap-4 border-b py-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink">The Marvel catalog</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-dim">{active.blurb}</p>
        </div>

        <div
          className="hairline flex shrink-0 self-start border sm:self-auto"
          role="group"
          aria-label="Viewing order"
        >
          {ORDERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setParam('order', item.key === 'release' ? null : item.key)}
              aria-pressed={order === item.key}
              className={[
                'meta px-4 py-2 transition-colors',
                order === item.key
                  ? 'bg-ink text-base'
                  : 'text-ink-faint hover:bg-raised hover:text-ink-dim',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="py-4">
        <FilterBar
          filters={filters}
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
        <ul className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {visibleMovies.map((movie, index) => (
            <li key={movie.id}>
              <TitleCard
                movie={movie}
                index={order === 'chronological' ? (movie.chrono_order ?? index) : movie.release_order}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
