import { Link, useParams } from 'react-router'

import { useMovies, useRecommendedOrders } from '../../api/catalog'
import { BackLink } from '../../components/BackLink'
import { LineBullet } from '../../components/LineBullet'
import { ProgressBar, WatchToggle } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { MEDIA_LABEL, formatRuntime, formatTotalRuntime, year } from '../../lib/format'
import { isWatched } from '../../lib/watchStorage'
import { makeItMineHref, orderStats } from './recommendedStats'

/**
 * One ready-made order, read-only, with the viewer's progress through it.
 *
 * Read-only because it is somebody else's list: Disney+'s, a guide's, or a
 * rule over the catalog. "Make it mine" hands a copy to the builder, which is
 * where reordering, trimming and saving already live.
 */
export function RecommendedOrderPage() {
  const { orderId } = useParams()
  const progress = useWatchProgress()
  const ordersQuery = useRecommendedOrders()
  const moviesQuery = useMovies({ order: 'release' })

  if (ordersQuery.isPending || moviesQuery.isPending) return <LoadingState label="Loading order" />
  const error = ordersQuery.error ?? moviesQuery.error
  if (error) return <ErrorState error={error} onRetry={() => ordersQuery.refetch()} />

  const order = ordersQuery.data.find((item) => item.id === orderId)
  if (!order) return <ErrorState error={{ status: 404 }} />

  const byId = new Map(moviesQuery.data.map((movie) => [movie.id, movie]))
  const stats = orderStats(order, progress)
  const remaining = order.movie_ids
    .filter((id) => !isWatched(progress, id))
    .reduce((sum, id) => sum + (byId.get(id)?.runtime_min ?? 0), 0)

  return (
    <div className="py-8">
      <BackLink to="/orders">Orders</BackLink>

      <header className="mt-4 pb-6">
        <p className="label text-ink-dim">
          {order.kind === 'curated' ? 'Recommended order' : 'Built from the catalog'}
        </p>
        <h1 className="display mt-1 text-5xl text-ink sm:text-6xl">{order.name}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-dim">{order.description}</p>

        <div className="mt-5 max-w-xl">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-sm font-semibold text-ink tabular-nums">
              {stats.watched} of {stats.total} watched
            </span>
            <span className="meta tabular-nums">
              {formatTotalRuntime(order.runtime_min)}
              {stats.watched > 0 && remaining > 0 && `, ${formatTotalRuntime(remaining)} to go`}
            </span>
          </div>
          <ProgressBar percent={stats.percent} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {stats.nextUp && byId.get(stats.nextUp) && (
            <Link to={`/movies/${stats.nextUp}`} className="btn btn-primary">
              Next up: {byId.get(stats.nextUp).title}
            </Link>
          )}
          <Link to={makeItMineHref(order)} className="btn">
            Make it mine
          </Link>
        </div>

        {(order.out_of_order > 0 || order.skipped_essentials > 0) && (
          <p className="mt-4 max-w-2xl text-sm text-ink-dim">
            Checked against the prerequisite map:{' '}
            {[
              order.out_of_order > 0 &&
                `${order.out_of_order} title${order.out_of_order === 1 ? ' comes' : 's come'} before something ${order.out_of_order === 1 ? 'it leans' : 'they lean'} on`,
              order.skipped_essentials > 0 &&
                `${order.skipped_essentials} essential prerequisite${order.skipped_essentials === 1 ? ' is' : 's are'} left out`,
            ]
              .filter(Boolean)
              .join(', and ')}
            . Make it mine to see which, and fix them in one click.
          </p>
        )}
      </header>

      <ol className="flex flex-col gap-1.5">
        {order.movie_ids.map((id, index) => {
          const movie = byId.get(id)
          if (!movie) return null
          const watched = isWatched(progress, id)
          const details = [
            year(movie.release_date),
            movie.media_type === 'film' ? formatRuntime(movie.runtime_min) : MEDIA_LABEL[movie.media_type],
          ].filter(Boolean)
          return (
            <li
              key={id}
              className={[
                'flex items-center gap-3 border-2 bg-surface px-3 py-2',
                id === stats.nextUp ? 'border-ink border-l-[6px] border-l-infinity' : 'border-ink',
              ].join(' ')}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${watched ? 'bg-ok text-on-ok' : 'bg-ink text-paper'}`}
              >
                {index + 1}
              </span>
              {movie.poster_url ? (
                <img
                  src={movie.poster_url}
                  alt=""
                  width={28}
                  height={42}
                  loading="lazy"
                  decoding="async"
                  className={`h-[42px] w-7 shrink-0 border-2 border-ink object-cover ${watched ? 'grayscale-[60%]' : ''}`}
                />
              ) : (
                <span className="h-[42px] w-7 shrink-0 border-2 border-ink bg-raised" />
              )}
              <LineBullet movie={movie} className="size-6 text-[11px]" />
              <Link to={`/movies/${id}`} className="group min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink group-hover:underline">
                  {movie.title}
                </span>
                <span className="meta">
                  {details.join(', ')}
                  {id === stats.nextUp && <span className="font-semibold text-ink">, next up</span>}
                </span>
              </Link>
              <WatchToggle
                movieId={id}
                watched={watched}
                title={movie.title}
                size="sm"
                episodeCount={movie.episode_count ?? 0}
              />
            </li>
          )
        })}
      </ol>

      {order.sources.length > 0 && (
        <section className="mt-8 max-w-2xl">
          <h2 className="label text-ink-dim">Sources</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {order.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ink underline underline-offset-4 hover:decoration-2"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
