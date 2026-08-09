import { useMemo } from 'react'
import { Link } from 'react-router'

import { useMovies } from '../../api/catalog'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { SAGA_LABEL, formatTotalRuntime, phaseLabel } from '../../lib/format'
import { listOrders } from '../../lib/orderStorage'
import { clearAll, isWatched, progressFor } from '../../lib/watchStorage'

function Row({ label, sublabel, movieIds, progress, to }) {
  const stats = progressFor(progress, movieIds)
  const body = (
    <div className="py-3">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="truncate text-sm text-ink">{label}</span>
        <span className="meta shrink-0 tabular-nums">
          {stats.watched}/{stats.total} · {stats.percent}%
        </span>
      </div>
      <ProgressBar percent={stats.percent} />
      {sublabel && <p className="meta mt-1.5">{sublabel}</p>}
    </div>
  )

  return (
    <li className="hairline border-b last:border-b-0">
      {to ? (
        <Link to={to} className="block transition-colors hover:bg-surface">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

export function ProgressPage() {
  const progress = useWatchProgress()
  const { data: movies, isPending, error, refetch } = useMovies({ order: 'release' })
  const orders = useMemo(() => listOrders(), [])

  if (isPending) return <LoadingState label="Loading catalog" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const allIds = movies.map((movie) => movie.id)
  const overall = progressFor(progress, allIds)

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
      <div className="hairline border-b pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Progress</h1>
        <p className="mt-1 text-sm text-ink-dim">
          {overall.watched} of {overall.total} watched
          {watchedRuntime > 0 && ` · ${formatTotalRuntime(watchedRuntime)} behind you`}
          {remainingRuntime > 0 && ` · ${formatTotalRuntime(remainingRuntime)} to go`}
        </p>
        <div className="mt-4 max-w-md">
          <ProgressBar percent={overall.percent} />
        </div>
      </div>

      <div className="grid gap-10 py-8 md:grid-cols-2">
        <section>
          <h2 className="meta hairline border-b pb-2">By phase</h2>
          <ul>
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

        <section>
          <h2 className="meta hairline border-b pb-2">By saga</h2>
          <ul>
            {sagas.map((saga) => (
              <Row
                key={saga}
                label={SAGA_LABEL[saga] ?? saga}
                movieIds={movies.filter((m) => m.saga === saga).map((m) => m.id)}
                progress={progress}
                to={`/catalog?saga=${saga}`}
              />
            ))}
          </ul>
        </section>
      </div>

      {orders.length > 0 && (
        <section className="pb-8">
          <h2 className="meta hairline border-b pb-2">Your orders</h2>
          <ul>
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
          className="meta text-ink-faint underline underline-offset-4 transition-colors hover:text-danger"
        >
          Reset progress
        </button>
      )}

      <p className="meta mt-8 max-w-xl leading-relaxed">
        Saved in this browser only. Accounts will sync it across devices.
      </p>
    </div>
  )
}
