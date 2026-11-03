import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'

import { fetchSession, signIn, signOut } from './api'

/**
 * `/admin`: the catalog editor, behind a password only the owner knows.
 *
 * Reachable by anyone — the footer links here — and that is deliberate. The door
 * being visible costs nothing; what protects the catalog is the server, which
 * answers every editor request with a 401 until the admin cookie is present, and
 * answers 404 to all of it when no password is configured. Nothing about this
 * page is a secret, and nothing here is trusted: hiding it from the client would
 * protect nothing.
 *
 * The editor itself is a separate chunk, loaded only after sign-in, so no
 * ordinary visitor downloads it.
 */
const EditorApp = lazy(() => import('./EditorApp').then((module) => ({ default: module.EditorApp })))

const SESSION_KEY = ['admin', 'session']

/** Keeps search engines off a page that has nothing to index. */
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex'
    document.head.append(tag)
    return () => tag.remove()
  }, [])
}

function Notice({ children }) {
  return <p className="meta py-16 text-center">{children}</p>
}

function PasswordForm({ onSignedIn }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setIsBusy(true)
    try {
      onSignedIn(await signIn(password))
    } catch (failure) {
      setError(failure.message ?? 'That did not work. Try again.')
      setPassword('')
      setIsBusy(false)
    }
  }

  return (
    <div className="panel benday mx-auto my-12 max-w-md p-6 sm:p-8">
      <h1 className="display text-5xl text-ink">Catalog editor</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        This is where the catalog itself is edited. It needs the editor password, which is not the
        same as an account password.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="block">
          <span className="label text-ink">Editor password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field mt-1.5"
          />
        </label>

        {error && (
          <p role="alert" className="border-2 border-danger border-l-[6px] bg-surface p-3 text-sm text-ink">
            {error}
          </p>
        )}

        <button type="submit" disabled={isBusy} className="btn btn-primary mt-2 w-full">
          {isBusy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}

export function AdminPage() {
  useNoIndex()
  const queryClient = useQueryClient()

  const session = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, retry: false })

  const setSession = (value) => queryClient.setQueryData(SESSION_KEY, value)
  const expire = () => setSession({ authenticated: false, open: false })

  // The editor gets a client of its own, because it wants the opposite of the
  // app's defaults: the catalog can change under an open tab (another tab, a
  // restore), and coming back to the window is exactly when to find out. It also
  // lets a 401 from any editor request — the 12-hour session running out
  // mid-edit — drop back to the password form rather than fail every save.
  const [editorClient] = useState(() => {
    const onError = (error) => {
      if (error?.status === 401) queryClient.setQueryData(SESSION_KEY, { authenticated: false, open: false })
    }
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false } },
    })
  })

  // Signing out must not leave the last catalog in memory for the next person.
  useEffect(() => () => editorClient.clear(), [editorClient])

  if (session.isPending) return <Notice>Checking…</Notice>

  if (session.error?.status === 404) {
    return <Notice>The editor is not enabled on this server.</Notice>
  }
  if (session.error) {
    return <Notice>Could not reach the server. {session.error.message}</Notice>
  }

  if (!session.data.authenticated) {
    return <PasswordForm onSignedIn={setSession} />
  }

  return (
    <QueryClientProvider client={editorClient}>
      <Suspense fallback={<Notice>Loading the editor…</Notice>}>
        <EditorApp
          // Nothing to sign out of when there is no password (dev).
          onSignOut={
            session.data.open
              ? undefined
              : async () => {
                  await signOut()
                  editorClient.clear()
                  expire()
                }
          }
        />
      </Suspense>
    </QueryClientProvider>
  )
}
