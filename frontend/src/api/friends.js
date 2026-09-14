/**
 * Friends: your code, requests in both directions, and what friends disclose.
 *
 * Every key is scoped by account id (`['me', id, 'friends', ...]`, the scoping
 * `api/userOrders.js` explains) because all of it is account data. Signing out
 * changes the key set rather than leaving a stale friends list on screen, and
 * signing in as somebody else on the same browser cannot show the previous
 * account's friends for the moment before the refetch lands.
 *
 * There is no localStorage fallback, unlike orders and progress, and none is
 * missing. A friendship is a relationship between two accounts; a browser
 * holding localStorage is not one of them, and pretending otherwise would mean
 * inventing a guest-side friends list that could never be honoured by the other
 * person. Every hook here is `enabled: Boolean(user)` and the page says so.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../auth/AuthContext'
import { api } from './client'

function scope(user, ...rest) {
  return ['me', user?.id ?? 'guest', 'friends', ...rest]
}

/**
 * The code you hand out.
 *
 * Cached indefinitely by default rather than refetched: it only changes when
 * this browser rotates it, and the mutation below writes the new value straight
 * into the cache.
 */
export function useFriendCode() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user, 'code'),
    queryFn: ({ signal }) => api('/me/friends/code', { signal }),
    enabled: Boolean(user),
    staleTime: Infinity,
  })
}

export function useRotateFriendCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api('/me/friends/code', { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(scope(user, 'code'), data),
  })
}

export function useFriends() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user, 'list'),
    queryFn: ({ signal }) => api('/me/friends', { signal }),
    enabled: Boolean(user),
  })
}

/**
 * Pending requests, both directions in one response.
 *
 * Polled while the tab is open, which is the whole of the "notification"
 * machinery this feature has. A request arriving is not urgent, nothing is lost
 * by learning about it a minute late, and a minute's polling is cheaper in every
 * sense than a websocket or a push subscription for a page most people will have
 * open for thirty seconds. `refetchOnWindowFocus` is what actually does the work
 * in practice -- coming back to the tab re-asks.
 *
 * Deliberately not a count on the nav item, which is the obvious next thing to
 * want. A badge has to be live on every page, so every page view by a signed-in
 * visitor would become a database connection -- and `app/api/deps.py` documents
 * at length why this app goes out of its way to avoid exactly that under the
 * NullPool production runs on. A request is not urgent enough to pay for it.
 */
export function useFriendRequests() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user, 'requests'),
    queryFn: ({ signal }) => api('/me/friends/requests', { signal }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  })
}

/**
 * Every friend's watched title ids.
 *
 * One call for all of them rather than one per friend: the compare page puts
 * several people side by side, and the server answers them together for the
 * reason `routes/friends.py` gives. The profile page reads the same cache entry
 * and picks one out, so opening a profile after comparing costs nothing.
 *
 * Not cached forever, unlike the catalog -- the point is that they keep
 * watching things.
 */
export function useFriendsProgress() {
  const { user } = useAuth()

  return useQuery({
    queryKey: scope(user, 'progress'),
    queryFn: ({ signal }) => api('/me/friends/progress', { signal }),
    enabled: Boolean(user),
    staleTime: 60_000,
  })
}

/**
 * Everything a friendship changes at once.
 *
 * Sending, accepting, declining and unfriending all move a row between the two
 * lists, so each of them invalidates both rather than trying to patch the cache
 * by hand. The lists are small and the server is the only thing that knows, for
 * instance, that a request crossed in the post and became a friendship.
 */
function useFriendMutation(mutationFn) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scope(user, 'list') })
      queryClient.invalidateQueries({ queryKey: scope(user, 'requests') })
      queryClient.invalidateQueries({ queryKey: scope(user, 'progress') })
    },
  })
}

export function useSendFriendRequest() {
  return useFriendMutation((code) => api('/me/friends/requests', { method: 'POST', body: { code } }))
}

export function useAcceptFriendRequest() {
  return useFriendMutation((userId) =>
    api(`/me/friends/requests/${userId}/accept`, { method: 'POST' }),
  )
}

/** Declining one sent to you and cancelling one you sent are the same call. */
export function useDismissFriendRequest() {
  return useFriendMutation((userId) =>
    api(`/me/friends/requests/${userId}`, { method: 'DELETE' }),
  )
}

export function useRemoveFriend() {
  return useFriendMutation((userId) => api(`/me/friends/${userId}`, { method: 'DELETE' }))
}

/**
 * A code as it should be read aloud: two groups of five.
 *
 * Grouping is not decoration. Ten undifferentiated characters is past the span
 * most people can hold while looking away from the screen, and the hyphen is
 * what makes reading one down a phone line possible at all. The server strips it
 * again on the way in, so nothing downstream has to know it exists.
 */
export function formatFriendCode(code) {
  if (!code) return ''
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/**
 * The code out of whatever was pasted: the code itself, or an invite URL with
 * it in `?code=`.
 *
 * Deliberately forgiving, exactly as `tokenFromInput` is in `api/share.js`, and
 * for the same reason: people paste the address bar or the whole message they
 * were sent. Anything this cannot make sense of is returned trimmed and handed
 * to the server, which normalises case, separators and the letters that read as
 * digits -- so this stays a convenience and never the thing that decides a code
 * is invalid.
 */
export function codeFromInput(value) {
  const trimmed = value.trim()
  const fromQuery = trimmed.match(/[?&]code=([A-Za-z0-9-]+)/)
  return fromQuery ? fromQuery[1] : trimmed
}
