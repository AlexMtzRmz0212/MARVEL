import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from './client'

/**
 * The catalog is immutable between deploys, so everything here is cached
 * forever. That is what makes switching between release and chronological
 * order, or toggling a filter, feel instant rather than like a page load.
 */
const FOREVER = { staleTime: Infinity, gcTime: Infinity }

export function useMovies(params) {
  return useQuery({
    queryKey: ['movies', params],
    queryFn: ({ signal }) => api('/movies', { params, signal }),
    ...FOREVER,
  })
}

export function useMovie(movieId) {
  return useQuery({
    queryKey: ['movie', movieId],
    queryFn: ({ signal }) => api(`/movies/${movieId}`, { signal }),
    enabled: Boolean(movieId),
    ...FOREVER,
  })
}

export function usePrerequisites(movieId, include = 'all') {
  return useQuery({
    queryKey: ['prerequisites', movieId, include],
    queryFn: ({ signal }) =>
      api(`/movies/${movieId}/prerequisites`, { params: { include }, signal }),
    enabled: Boolean(movieId),
    ...FOREVER,
  })
}

export function useOrder(kind, includeAdjacent = false) {
  return useQuery({
    queryKey: ['order', kind, includeAdjacent],
    queryFn: ({ signal }) =>
      api(`/orders/${kind}`, { params: { include_adjacent: includeAdjacent }, signal }),
    ...FOREVER,
  })
}

/** Fetched once and reused for live validation while dragging. */
export function useEdges() {
  return useQuery({
    queryKey: ['graph-edges'],
    queryFn: ({ signal }) => api('/graph/edges', { signal }),
    select: (data) => data.edges,
    ...FOREVER,
  })
}

export function useValidateOrder() {
  return useMutation({
    mutationFn: (order) => api('/orders/validate', { method: 'POST', body: { order } }),
  })
}

export function useCompleteOrder() {
  return useMutation({
    mutationFn: (order) => api('/orders/complete', { method: 'POST', body: { order } }),
  })
}
