/**
 * Saved custom orders, from whichever store currently holds them.
 *
 * Unlike watch progress, orders are documents: there are three call sites, they
 * are written by an explicit "Save order" button rather than a click on a grid,
 * and they genuinely have loading and error states worth showing. So they go
 * through TanStack Query, which the app already uses for everything else on the
 * wire, and the localStorage functions in `lib/orderStorage.js` become the
 * guest-mode implementation behind it — that module is unchanged.
 *
 * Query keys carry the account id so switching users changes the key set
 * naturally. Calling queryClient.clear() instead would also evict the catalog,
 * which is cached forever on purpose.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../auth/AuthContext'
import {
  deleteOrder as deleteLocalOrder,
  getOrder as getLocalOrder,
  listOrders as listLocalOrders,
  saveOrder as saveLocalOrder,
} from '../lib/orderStorage'
import { api } from './client'

function scope(user) {
  return ['me', user?.id ?? 'guest', 'orders']
}

export function useOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user),
    queryFn: ({ signal }) =>
      user ? api('/me/orders', { signal }) : Promise.resolve(listLocalOrders()),
  })
}

export function useOrderQuery(orderId) {
  const { user } = useAuth()

  return useQuery({
    queryKey: [...scope(user), orderId],
    queryFn: ({ signal }) =>
      user ? api(`/me/orders/${orderId}`, { signal }) : Promise.resolve(getLocalOrder(orderId)),
    enabled: Boolean(orderId),
    // A saved order that no longer exists is an answer, not a failure worth
    // retrying — the builder falls back to an empty one.
    retry: false,
  })
}

export function useSaveOrder() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, movie_ids }) => {
      if (!user) return saveLocalOrder({ id, name, movie_ids })

      // PUT when we know the id, POST otherwise. The id is a crypto.randomUUID()
      // either way, and the server accepts a client-supplied one, so an order
      // built as a guest keeps its identity after it is uploaded.
      if (id) {
        return api(`/me/orders/${id}`, { method: 'PUT', body: { name, movie_ids } })
      }
      return api('/me/orders', { method: 'POST', body: { name, movie_ids } })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scope(user) }),
  })
}

export function useDeleteOrder() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId) => {
      if (!user) return deleteLocalOrder(orderId)
      return api(`/me/orders/${orderId}`, { method: 'DELETE' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scope(user) }),
  })
}
