import { Link } from 'react-router'

import { useMovies } from '../../api/catalog'
import { useOrders } from '../../api/userOrders'
import { useAuth } from '../../auth/AuthContext'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { SAGA_LABEL, formatTotalRuntime, phaseLabel } from '../../lib/format'
import { clearAll, isWatched, progressFor, sortCounts } from '../../lib/watchStorage'

function Row({ label, sublabel, movieIds, progress, to }) {
  const stats = progressFor(progress, movieIds)
  const body = (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-semibold text-ink">{label}</span>
        <span className="meta shrink-0 tabular-nums">
          {stats.watched} of {stats.total}, {stats.percent}%
        </span>
      </div>
      <ProgressBar percent={stats.percent} />
      {sublabel && <p className="meta mt-1.5">{sublabel}</p>}
    </div>
  )

  return (
    <li>
      {to ? (
        <Link to={to} className="block transition-colors hover:bg-raised">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

export function ProgressPage() {
  const { user } = useAuth()
  const progress = useWatchProgress()
  const { data: movies, isPending, error, refetch } = useMovies({ order: 'release' })
  // Saved orders are a secondary panel here, so a slow load should not hold up
  // the phase and saga breakdowns -- default to none until they arrive.
  const { data: orders = [] } = useOrders()

  if (isPending) return <LoadingState label="Loading catalog" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const allIds = movies.map((movie) => movie.id)
  const overall = progressFor(progress, allIds)
  const sorted = sortCounts(progress, allIds)

  const watchedRuntime = movies
    .filter((movie) => isWatched(progress, movie.id))
    .reduce((sum, movie) => sum + (movie.runtime_min ?? 0), 0)
  const remainingRuntime = movies
    .filter((movie) => !isWatched(progress, movie.id))
    .reduce((sum, movie) => sum + (movie.runtime_min ?? 0), 0)

  const phases = [...new Set(movies.map((movie) => movie.phase).filter(Boolean))].sort()
  const sagas = [...new Set(movies.map((movie) => movie.saga))]

  return (
    <div className="py-8">
      <div className="flex flex-col gap-6 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="display text-5xl text-ink sm:text-6xl">Progress</h1>
          <p className="mt-2 text-base text-ink-dim">
            {overall.watched} of {overall.total} watched
            {watchedRuntime > 0 && `, ${formatTotalRuntime(watchedRuntime)} behind you`}
            {remainingRuntime > 0 && `, ${formatTotalRuntime(remainingRuntime)} to go`}
          </p>
          <div className="mt-4 max-w-xl">
            <ProgressBar percent={overall.percent} />
          </div>
        </div>
        <div className="flex items-end gap-4">
          <p className="display text-7xl normal-case tabular-nums text-ink">{overall.percent}%</p>
          <Link to="/progress/compare" className="btn mb-2">
            Compare with a friend
          </Link>
        </div>
      </div>

      {(sorted.unsorted > 0 || sorted.unsure > 0) && (
        <section className="panel benday mb-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="display text-3xl text-ink">Quick sort</h2>
            <p className="mt-1 text-sm text-ink-dim">
              {sorted.unsorted > 0 && (
                <>
                  {sorted.unsorted} title{sorted.unsorted === 1 ? '' : 's'} you haven't sorted yet.{' '}
                </>
              )}
              {sorted.unsure > 0 && <>{sorted.unsure} you couldn't remember.</>}
            </p>
          </div>
          <Link to="/progress/sort" className="btn btn-primary shrink-0">
            {sorted.unsorted > 0 ? 'Swipe through them' : 'Revisit the maybes'}
          </Link>
        </section>
      )}

      <div className="grid items-start gap-3 md:grid-cols-2">
        <section className="panel">
          <div className="px-5 pt-5">
            <h2 className="caption caption-corner !mb-1">By phase</h2>
          </div>
          <ul className="divide-y divide-hairline">
            {phases.map((phase) => (
              <Row
                key={phase}
                label={phaseLabel(phase)}
                movieIds={movies.filter((m) => m.phase === phase).map((m) => m.id)}
                progress={progress}
                to={`/catalog?phase=${phase}`}
              />
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="px-5 pt-5">
            <h2 className="caption caption-corner !mb-1">By saga</h2>
          </div>
          <ul className="divide-y divide-hairline">
            {sagas.map((saga) => (
              <Row
                key={saga}
                label={SAGA_LABEL[saga] ?? saga}
                movieIds={movies.filter((m) => m.saga === saga).map((m) => m.id)}
                progress={progress}
                to={`/catalog?saga=${encodeURIComponent(saga)}`}
              />
            ))}
          </ul>
        </section>
      </div>

      {orders.length > 0 && (
        <section className="panel mt-3">
          <div className="px-5 pt-5">
            <h2 className="caption caption-corner !mb-1">Your orders</h2>
          </div>
          <ul className="divide-y divide-hairline">
            {orders.map((order) => (
              <Row
                key={order.id}
                label={order.name}
                movieIds={order.movie_ids}
                progress={progress}
                to={`/orders/${order.id}`}
              />
            ))}
          </ul>
        </section>
      )}

      {overall.watched > 0 && (
        <button
          type="button"
          onClick={() => {
            if (confirm('Clear all watch progress? This cannot be undone.')) clearAll()
          }}
          className="btn btn-danger mt-6"
        >
          Reset progress
        </button>
      )}

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-dim">
        {user ? (
          <>Saved to your account and synced across your devices.</>
        ) : (
          <>
            Saved in this browser only.{' '}
            <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
              Sign in
            </Link>{' '}
            to sync it across devices.
          </>
        )}
      </p>
    </div>
  )
}
