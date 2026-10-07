import { useState } from 'react'
import { Link } from 'react-router'

import { useDeleteOrder, useOrders } from '../../api/userOrders'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/states'
import { formatDate } from '../../lib/format'

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

export function OrdersPage() {
  const { user } = useAuth()
  const { data: orders, isPending, error } = useOrders()
  const deleteOrder = useDeleteOrder()

  if (isPending) return <LoadingState label="Loading orders" />
  if (error) return <ErrorState error={error} />

  return (
    <div className="py-8">
      <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-5xl text-ink sm:text-6xl">Your orders</h1>
          <p className="mt-2 max-w-xl text-base text-ink-dim">
            Build a viewing order and get told the moment it breaks a prerequisite.
          </p>
        </div>
        <Link
          to="/orders/new"
          className="btn btn-primary shrink-0 self-start sm:self-auto"
        >
          New order
        </Link>
      </div>

      {orders.length === 0 ? (
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
