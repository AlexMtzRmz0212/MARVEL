import { useEffect, useRef, useState } from 'react'

import { useAuth } from './AuthContext'

/**
 * Irreversible account deletion, behind a password re-entry.
 *
 * Modelled on MergePrompt rather than a page of its own: this is a confirmation
 * step, and routing to /account for it would leave a URL that means nothing on
 * its own. The password field is what the API insists on, so the dialog would
 * need one either way.
 */
export function DeleteAccountDialog({ onClose }) {
  const { user, deleteAccount } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setIsDeleting(true)
    try {
      await deleteAccount(password)
      // No navigation and no success toast: the account is gone, the provider
      // has already put the stores back on localStorage, and the header
      // re-renders as a guest. Anything more would be announcing a page the
      // user no longer has.
      onClose()
    } catch (requestError) {
      setError(requestError.message)
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="hairline w-full max-w-md border border-l-2 border-l-danger bg-surface p-6 shadow-xl"
      >
        <h2 id="delete-account-title" className="text-lg font-medium tracking-tight text-ink">
          Delete your account?
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This erases <span className="text-ink">{user?.email}</span>, your display name, every
          custom order you have saved and all of your watch progress. It happens immediately and
          cannot be undone.
        </p>

        <label className="mt-5 block">
          <span className="meta">Confirm your password</span>
          <input
            ref={inputRef}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="hairline mt-1 block w-full border bg-base px-3 py-2 font-mono text-sm text-ink focus:border-hairline-strong focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="meta mt-3 text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={isDeleting || password.length === 0}
            className="meta border border-danger px-4 py-2 text-danger transition-colors hover:bg-danger hover:text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? 'Deleting…' : 'Delete my account'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="meta px-4 py-2 text-ink-dim transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
