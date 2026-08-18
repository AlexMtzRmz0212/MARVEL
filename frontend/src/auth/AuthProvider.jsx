/**
 * Who is signed in, and which store backs their data.
 *
 * Guest mode is a first-class state, not a degraded one: with `user` null the
 * whole app works exactly as it did before accounts existed, backed by
 * localStorage. Signing in swaps the storage backends and offers to bring the
 * local data along; signing out swaps them back and drops it from the device.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, setUnauthorizedHandler } from '../api/client'
import {
  deleteAccount as deleteAccountRequest,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  register,
} from '../api/auth'
import { setDisplayPrefBackend } from '../lib/watchDisplayPref'
import { resetToLocalStorage, setWatchBackend } from '../lib/watchStorage'
import { AuthContext } from './AuthContext'
import { MergePrompt } from './MergePrompt'
import { collectLocalData, useMergePrompt } from './useMergeLocalData'

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const merge = useMergePrompt()
  const [isSwitching, setIsSwitching] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await fetchMe()
      } catch (error) {
        // A guest gets a 401 here on every page load. That is the answer, not a
        // failure — returning null keeps it out of the error path entirely.
        if (error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  // The handler below runs outside React's data flow, so it reads the current
  // user from a ref rather than closing over a stale render's value.
  const userRef = useRef(null)
  useEffect(() => {
    userRef.current = user ?? null
  }, [user])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Guarded, not unconditional: /auth/me 401s for every guest at boot, and
      // an unguarded handler would fire a spurious sign-out on first paint.
      // With the guard, only a session that expires mid-visit trips it.
      if (!userRef.current) return
      // Dropping the user is the whole action: the identity effect below sees
      // it go null and puts the stores back on localStorage.
      queryClient.setQueryData(['auth', 'me'], null)
    })
    return () => setUnauthorizedHandler(null)
  }, [queryClient])

  // Which account the stores are currently pointed at. Signing in is not the
  // only way to arrive signed in -- reloading the page with a live cookie gets
  // there too, and that path has to hydrate exactly the same way. Keying the
  // effect below on identity rather than on the sign-in *event* covers both,
  // and doubles as the StrictMode guard.
  const adoptedIdRef = useRef(null)

  useEffect(() => {
    const id = user?.id ?? null
    if (id === adoptedIdRef.current) return

    if (id === null) {
      adoptedIdRef.current = null
      resetToLocalStorage()
      setDisplayPrefBackend('local')
      return
    }

    // Claimed before awaiting so React's double-invoked effect does not fire a
    // second request; released again if the fetch fails, so a transient error
    // does not strand the app in a half-signed-in state.
    adoptedIdRef.current = id
    let cancelled = false

    // Deliberately not gated behind a loading flag. The store notifies its
    // subscribers when the data lands, so watched marks fill in a moment after
    // the grid paints -- which beats holding the whole page for one request.
    api('/me/watch-progress')
      .then((progress) => {
        if (cancelled) return
        setWatchBackend('remote', progress)
        setDisplayPrefBackend('remote', user.preferences?.watched_display_mode)
      })
      .catch(() => {
        if (!cancelled) adoptedIdRef.current = null
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const adoptAccount = useCallback(
    async (account) => {
      setIsSwitching(true)
      try {
        // Collected before the account lands, because the effect above swaps
        // the stores the moment it does and that replaces the local snapshot.
        const local = collectLocalData()
        if (local) await merge.offer(local)

        queryClient.setQueryData(['auth', 'me'], account)
        await queryClient.invalidateQueries({ queryKey: ['me'] })
      } finally {
        setIsSwitching(false)
      }
    },
    [merge, queryClient],
  )

  const signIn = useCallback(
    async (credentials) => adoptAccount(await loginRequest(credentials)),
    [adoptAccount],
  )

  const signUp = useCallback(
    async (details) => adoptAccount(await register(details)),
    [adoptAccount],
  )

  const signOut = useCallback(async () => {
    await logoutRequest()
    // Clearing the user is enough: the effect above sees the identity go null
    // and puts both stores back on localStorage. Leaving the account's data on
    // the device would be a real leak on a shared computer.
    queryClient.setQueryData(['auth', 'me'], null)
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [queryClient])

  const deleteAccount = useCallback(
    async (password) => {
      await deleteAccountRequest(password)
      // Same teardown as signing out, and for the same reason: the identity
      // effect above sees the user go null and puts the stores back on
      // localStorage. The difference is only on the server, where there is now
      // nothing left to sign back in to.
      queryClient.setQueryData(['auth', 'me'], null)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    [queryClient],
  )

  const value = useMemo(
    () => ({
      user: user ?? null,
      isLoading: isLoading || isSwitching,
      signIn,
      signUp,
      signOut,
      deleteAccount,
    }),
    [user, isLoading, isSwitching, signIn, signUp, signOut, deleteAccount],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      <MergePrompt merge={merge} />
    </AuthContext.Provider>
  )
}
