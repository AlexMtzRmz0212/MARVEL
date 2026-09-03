/**
 * Share links: the one you hand out, and the one somebody handed you.
 *
 * Two different things behind one module. Your own token is account data and is
 * keyed like the rest of it (`['me', id, 'share']`, the scoping explained in
 * `api/userOrders.js`), so signing out cannot leave a stale link on screen.
 * Somebody else's is keyed by the token alone -- it belongs to no account of
 * yours, and two people following the same link should share the cache entry.
 *
 * There is no localStorage fallback here, unlike orders and progress. A guest's
 * progress never leaves their browser, so there is genuinely nothing to share
 * until they have an account, and the page says so rather than pretending.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../auth/AuthContext'
import { api } from './client'

function scope(user) {
  return ['me', user?.id ?? 'guest', 'share']
}

export function useMyShareLink() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user),
    queryFn: ({ signal }) => api('/me/share', { signal }),
    enabled: Boolean(user),
  })
}

/** Mint a link, or rotate the one already out there. Same call for both. */
export function useCreateShareLink() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api('/me/share', { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(scope(user), data),
  })
}

export function useRevokeShareLink() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api('/me/share', { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData(scope(user), { token: null }),
  })
}

/**
 * Somebody else's watched titles.
 *
 * `retry: false` for the same reason `useOrderQuery` sets it: a revoked or
 * mistyped link is an answer, not a failure worth three more round trips, and
 * the page has a sentence ready for it.
 *
 * Not cached forever, unlike the catalog -- the whole point is that the other
 * person keeps watching things.
 */
export function useSharedProgress(token) {
  return useQuery({
    queryKey: ['share', token],
    queryFn: ({ signal }) => api(`/share/${encodeURIComponent(token)}`, { signal }),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  })
}

/**
 * The token out of whatever was pasted: a full URL, a bare token, or a URL with
 * the token in `?with=`.
 *
 * Deliberately forgiving. People paste the address bar, the share sheet's text,
 * or just the tail end, and a form that only accepts one of those is a form
 * that looks broken.
 */
export function tokenFromInput(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const fromQuery = trimmed.match(/[?&]with=([A-Za-z0-9_-]+)/)
  if (fromQuery) return fromQuery[1]

  // A bare token is 22 url-safe characters; anything with a slash or a space in
  // it is a URL whose last segment we want instead.
  const last = trimmed.split(/[/\s]+/).filter(Boolean).pop() ?? ''
  return /^[A-Za-z0-9_-]+$/.test(last) ? last : ''
}
