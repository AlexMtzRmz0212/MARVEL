import { Link } from 'react-router'

import { useDeleteOrder, useOrders } from '../../api/userOrders'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/states'
import { formatDate } from '../../lib/format'

export function OrdersPage() {
  const { user } = useAuth()
  const { data: orders, isPending, error } = useOrders()
  const deleteOrder = useDeleteOrder()

  if (isPending) return <LoadingState label="Loading orders" />
  if (error) return <ErrorState error={error} />

  return (
    <div className="py-8">
      <div className="hairline flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink">Your orders</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-dim">
            Build a viewing order and get told the moment it breaks a prerequisite.
          </p>
        </div>
        <Link
          to="/orders/new"
          className="meta shrink-0 self-start border border-hairline-strong px-4 py-2 text-ink transition-colors hover:bg-raised sm:self-auto"
        >
          New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="hairline my-12 border border-dashed px-6 py-16 text-center">
          <p className="meta">No saved orders yet</p>
          <Link
            to="/orders/new"
            className="mt-4 inline-block text-sm text-ink-dim underline underline-offset-4 transition-colors hover:text-ink"
          >
            Build your first one
          </Link>
        </div>
      ) : (
        <ul className="py-6">
          {orders.map((order) => (
            <li key={order.id} className="hairline border-b last:border-b-0">
              <div className="flex items-center gap-4 py-3">
                <Link to={`/orders/${order.id}`} className="group min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{order.name}</span>
                  <span className="meta">
                    {order.movie_ids.length} titles · updated{' '}
                    {formatDate(order.updated_at?.slice(0, 10))}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => deleteOrder.mutate(order.id)}
                  disabled={deleteOrder.isPending}
                  className="meta shrink-0 px-2 py-1 text-ink-faint transition-colors hover:text-danger disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="meta mt-8 max-w-xl leading-relaxed">
        {user ? (
          <>Saved to your account and synced across your devices.</>
        ) : (
          <>
            Saved in this browser only.{' '}
            <Link to="/login" className="underline underline-offset-4 hover:text-ink-dim">
              Sign in
            </Link>{' '}
            to sync them across devices.
          </>
        )}
      </p>
    </div>
  )
}
