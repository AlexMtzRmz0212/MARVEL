import { useState } from 'react'
import { Link } from 'react-router'

import { useMovies, useRecommendedOrders } from '../../api/catalog'
import { useDeleteOrder, useOrders } from '../../api/userOrders'
import { useAuth } from '../../auth/AuthContext'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { formatDate, formatTotalRuntime } from '../../lib/format'
import { orderStats } from './recommendedStats'

/**
 * One saved order. Delete asks once, in place, before anything is removed:
 * an order is the one thing on this page that took effort to make.
 */
function OrderRow({ order, deleteOrder }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to={`/orders/${order.id}`} className="group min-w-0 flex-1">
          <span className="block truncate font-bold text-ink group-hover:underline group-hover:underline-offset-2">
            {order.name}
          </span>
          <span className="meta">
            {order.movie_ids.length} titles, updated {formatDate(order.updated_at?.slice(0, 10))}
          </span>
        </Link>
        {confirming ? (
          <span role="group" aria-label={`Delete ${order.name}?`} className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-ink-dim">Delete for good?</span>
            <button
              type="button"
              onClick={() => deleteOrder.mutate(order.id)}
              disabled={deleteOrder.isPending}
              className="btn btn-sm btn-danger"
            >
              {deleteOrder.isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn btn-sm">
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${order.name}`}
            className="btn btn-sm btn-danger shrink-0"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * The ready-made orders, as a shelf of panels: what each one is for, how long
 * it is, and how far into it the viewer already is. Loads beside the saved
 * orders rather than in front of them, so a slow request never blocks either.
 */
function Recommended() {
  const progress = useWatchProgress()
  const { data: orders, isPending, error, refetch } = useRecommendedOrders()
  const { data: movies } = useMovies({ order: 'release' })

  if (isPending) return <LoadingState label="Loading recommended orders" />
  // Its own message rather than the shared error panel: whatever went wrong,
  // it went wrong with this list only, and the saved orders below still work.
  if (error) {
    return (
      <div role="alert" className="panel max-w-lg border-l-[6px] border-l-danger p-5">
        <p className="font-semibold text-ink">Couldn't load the recommended orders.</p>
        <p className="mt-1 text-sm text-ink-dim">Your own orders below are not affected.</p>
        <button type="button" onClick={() => refetch()} className="btn btn-sm mt-3">
          Try again
        </button>
      </div>
    )
  }

  const titles = new Map((movies ?? []).map((movie) => [movie.id, movie.title]))

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((order) => {
        const stats = orderStats(order, progress)
        return (
          <li key={order.id}>
            <Link
              to={`/orders/recommended/${order.id}`}
              className="panel group flex h-full flex-col gap-3 p-4 hover:bg-raised"
            >
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="display text-2xl text-ink group-hover:underline">{order.name}</h3>
                  {order.kind === 'curated' && (
                    <span className="label shrink-0 text-ink-dim">Curated</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-dim">{order.tagline}</p>
              </div>
              <div className="mt-auto">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="meta tabular-nums">
                    {order.movie_ids.length} titles, {formatTotalRuntime(order.runtime_min)}
                  </span>
                  <span className="meta tabular-nums">{stats.percent}%</span>
                </div>
                <ProgressBar percent={stats.percent} />
                {stats.watched > 0 && stats.nextUp && titles.get(stats.nextUp) && (
                  <p className="meta mt-1.5 truncate">
                    Next up: <span className="font-semibold text-ink">{titles.get(stats.nextUp)}</span>
                  </p>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function OrdersPage() {
  const { user } = useAuth()
  const { data: orders, isPending, error } = useOrders()
  const deleteOrder = useDeleteOrder()

  return (
    <div className="py-8">
      <div className="pb-6">
        <h1 className="display text-5xl text-ink sm:text-6xl">Orders</h1>
        <p className="mt-2 max-w-xl text-base text-ink-dim">
          Start from a recommended order, or build your own and get told the moment it breaks a
          prerequisite.
        </p>
      </div>

      <section aria-labelledby="recommended-heading">
        <h2 id="recommended-heading" className="caption caption-corner">
          Recommended
        </h2>
        <Recommended />
      </section>

      <section aria-labelledby="yours-heading" className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="yours-heading" className="caption caption-corner !mb-0">
            Yours
          </h2>
          <Link to="/orders/new" className="btn btn-primary shrink-0">
            New order
          </Link>
        </div>

        {isPending ? (
          <LoadingState label="Loading orders" />
        ) : error ? (
          <ErrorState error={error} />
        ) : orders.length === 0 ? (
          <div className="halftone my-6 border-2 border-dashed border-ink px-6 py-16 text-center">
            <p className="inline-block bg-paper px-2 text-sm font-semibold text-ink-dim">
              No saved orders yet
            </p>
            <div className="mt-4">
              <Link to="/orders/new" className="btn bg-surface">
                Build your first one
              </Link>
            </div>
          </div>
        ) : (
          <ul className="panel divide-y divide-hairline">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} deleteOrder={deleteOrder} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-dim">
        {user ? (
          <>Saved to your account and synced across your devices.</>
        ) : (
          <>
            Saved in this browser only.{' '}
            <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
              Sign in
            </Link>{' '}
            to sync them across devices.
          </>
        )}
      </p>
    </div>
  )
}
