import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { usePrerequisites } from '../../api/catalog'
import { BackLink } from '../../components/BackLink'
import { CheckIcon, ProgressBar } from '../../components/WatchToggle'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { formatTotalRuntime } from '../../lib/format'
import { isWatched, markManyWatched, progressFor } from '../../lib/watchStorage'
import { PrereqChainList, PrereqGraph } from './PrereqGraph'

function Stat({ label, value }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <dt className="meta">{label}</dt>
      <dd className="display mt-0.5 text-4xl normal-case tabular-nums text-ink">{value}</dd>
    </div>
  )
}

export function PrereqGraphPage() {
  const { movieId } = useParams()
  const [essentialOnly, setEssentialOnly] = useState(false)
  const progress = useWatchProgress()

  const { data, isPending, error, refetch } = usePrerequisites(
    movieId,
    essentialOnly ? 'essential' : 'all',
  )

  if (isPending) return <LoadingState label="Resolving prerequisites" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const { movie, stats, nodes, edges, watch_order: watchOrder } = data
  const totalRuntime = formatTotalRuntime(stats.total_runtime_min)

  // Merged in from the watch store rather than fetched. The API has a `watched`
  // field for this and it stays deliberately unpopulated: this response is
  // cached forever on the grounds that the catalog is immutable between
  // deploys, and making it depend on per-user state would mean invalidating it
  // on every toggle. The store is already correct for both guests and accounts,
  // so there is nothing to gain.
  const watchedNodes = nodes.map((node) => ({
    ...node,
    watched: isWatched(progress, node.id),
  }))
  const chainProgress = progressFor(progress, watchOrder)
  const unwatchedRuntime = watchedNodes
    .filter((node) => !node.is_target && !node.watched)
    .reduce((sum, node) => sum + (node.runtime_min ?? 0), 0)

  return (
    <article className="py-8">
      <BackLink to={`/movies/${movieId}`}>{movie.title}</BackLink>

      <header className="mt-4 flex flex-col gap-5 pb-5">
        {/* The whole heading, rather than an eyebrow reading "Watch before"
            stacked over the bare title: one sentence says what the page is. */}
        <h1 className="display text-5xl text-balance text-ink sm:text-6xl">
          Watch before {movie.title}
        </h1>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <dl className="flex flex-wrap gap-0.5 border-2 border-ink bg-ink">
            <Stat label="Titles" value={stats.total} />
            <Stat label="Required" value={stats.essential} />
            <Stat label="Recommended" value={stats.recommended} />
            {totalRuntime && (
              <Stat
                label={chainProgress.watched > 0 ? 'Left to watch' : 'Runtime'}
                value={
                  chainProgress.watched > 0
                    ? (formatTotalRuntime(unwatchedRuntime) ?? '0m')
                    : totalRuntime
                }
              />
            )}
            <Stat label="Depth" value={stats.max_depth} />
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEssentialOnly((value) => !value)}
              aria-pressed={essentialOnly}
              className="chip min-h-10 px-4"
            >
              Essential only
            </button>
            <Link
              to={`/orders/new?start=${movieId}&name=${encodeURIComponent(`Watching ${movie.title}`)}`}
              className="btn btn-primary"
            >
              Build an order from this
            </Link>
          </div>
        </div>
      </header>

      {stats.total === 0 ? (
        <EmptyState>
          Nothing comes first. This is a starting point, watchable with no context
        </EmptyState>
      ) : (
        <>
          <section className="panel flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-48 flex-1">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">
                  {chainProgress.watched} of {chainProgress.total} watched
                </span>
                <span className="meta text-sm">
                  {chainProgress.percent}%
                </span>
              </div>
              <ProgressBar percent={chainProgress.percent} />
            </div>
            {chainProgress.remaining > 0 && (
              <button
                type="button"
                onClick={() => markManyWatched(watchOrder)}
                className="btn"
              >
                Mark all {chainProgress.remaining} watched
              </button>
            )}
          </section>

          <div className="meta flex flex-wrap items-center gap-x-5 gap-y-2 py-4 text-ink-dim">
            <span className="flex items-center gap-2">
              <svg width="26" height="8" aria-hidden="true">
                <line x1="2" y1="4" x2="24" y2="4" stroke="var(--color-ink)" strokeWidth="6" strokeLinecap="round" />
                <line x1="2" y1="4" x2="24" y2="4" stroke="var(--color-infinity)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Required
            </span>
            <span className="flex items-center gap-2">
              <svg width="26" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="26"
                  y2="4"
                  stroke="var(--color-ink)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
              </svg>
              Recommended
            </span>
            <span className="flex items-center gap-2">
              <span className="station grid size-5 place-items-center bg-ok text-on-ok">
                <CheckIcon className="size-3" />
              </span>
              Watched
            </span>
            <span>
              Earliest on the left. Hover a title to trace it, or a line to see why.
            </span>
          </div>

          {/* The column layout needs horizontal room; narrow screens get the
              same data as an ordered list instead of a squeezed diagram. */}
          <div className="hidden md:block">
            <PrereqGraph nodes={watchedNodes} edges={edges} />
          </div>
          <div className="md:hidden">
            <PrereqChainList watchOrder={watchOrder} nodes={watchedNodes} />
          </div>

          <section className="py-10">
            <h2 className="display text-3xl text-ink">In watch order</h2>
            <div className="mt-4 hidden md:block">
              <PrereqChainList watchOrder={watchOrder} nodes={watchedNodes} />
            </div>
          </section>
        </>
      )}
    </article>
  )
}
