import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { usePrerequisites } from '../../api/catalog'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { accentFor, formatTotalRuntime } from '../../lib/format'
import { PrereqChainList, PrereqGraph } from './PrereqGraph'

function Stat({ label, value, accent }) {
  return (
    <div className="hairline border-l pl-3">
      <p className="meta">{label}</p>
      <p className="mt-0.5 font-mono text-lg tabular-nums" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}

export function PrereqGraphPage() {
  const { movieId } = useParams()
  const [essentialOnly, setEssentialOnly] = useState(false)

  const { data, isPending, error, refetch } = usePrerequisites(
    movieId,
    essentialOnly ? 'essential' : 'all',
  )

  if (isPending) return <LoadingState label="Resolving prerequisites" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const { movie, stats, nodes, edges, watch_order: watchOrder } = data
  const accent = accentFor(movie)
  const totalRuntime = formatTotalRuntime(stats.total_runtime_min)

  return (
    <article className="py-8">
      <Link
        to={`/movies/${movieId}`}
        className="meta text-ink-faint transition-colors hover:text-ink"
      >
        &larr; {movie.title}
      </Link>

      <header className="hairline mt-4 flex flex-col gap-6 border-b pb-6">
        <div>
          <p className="meta">Watch before</p>
          <h1 className="mt-1 text-3xl leading-tight font-medium tracking-tight text-ink">
            {movie.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap gap-6">
            <Stat label="Titles" value={stats.total} accent={accent} />
            <Stat label="Required" value={stats.essential} accent={accent} />
            <Stat label="Recommended" value={stats.recommended} accent="var(--color-ink-dim)" />
            {totalRuntime && (
              <Stat label="Runtime" value={totalRuntime} accent="var(--color-ink-dim)" />
            )}
            <Stat label="Depth" value={stats.max_depth} accent="var(--color-ink-dim)" />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEssentialOnly((value) => !value)}
              aria-pressed={essentialOnly}
              className={[
                'meta border px-3 py-1.5 transition-colors',
                essentialOnly
                  ? 'border-transparent bg-ink text-base'
                  : 'border-hairline-strong text-ink-dim hover:text-ink',
              ].join(' ')}
            >
              Essential only
            </button>
            <Link
              to={`/orders/new?start=${movieId}&name=${encodeURIComponent(`Watching ${movie.title}`)}`}
              className="meta border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
            >
              Build an order from this
            </Link>
          </div>
        </div>
      </header>

      {stats.total === 0 ? (
        <EmptyState>
          Nothing comes first — this is a starting point, watchable with no context
        </EmptyState>
      ) : (
        <>
          <div className="meta flex flex-wrap items-center gap-x-5 gap-y-2 py-4">
            <span className="flex items-center gap-2">
              <svg width="26" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="26"
                  y2="4"
                  stroke="var(--color-hairline-strong)"
                  strokeWidth="1.5"
                />
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
                  stroke="var(--color-hairline-strong)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              </svg>
              Recommended
            </span>
            <span className="text-ink-faint/70">Earliest on the left · hover an edge for why</span>
          </div>

          {/* The column layout needs horizontal room; narrow screens get the
              same data as an ordered list instead of a squeezed diagram. */}
          <div className="hidden md:block">
            <PrereqGraph nodes={nodes} edges={edges} />
          </div>
          <div className="md:hidden">
            <PrereqChainList watchOrder={watchOrder} nodes={nodes} />
          </div>

          <section className="py-10">
            <h2 className="meta hairline border-b pb-2">In watch order</h2>
            <div className="mt-4 hidden md:block">
              <PrereqChainList watchOrder={watchOrder} nodes={nodes} />
            </div>
          </section>
        </>
      )}
    </article>
  )
}
