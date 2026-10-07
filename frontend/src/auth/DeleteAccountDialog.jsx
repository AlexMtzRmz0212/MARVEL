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
    <div className="halftone fixed inset-0 z-50 flex items-center justify-center bg-paper/85 px-4 overscroll-contain">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="floating w-full max-w-md border-l-[6px] border-l-danger p-6"
      >
        <h2 id="delete-account-title" className="display text-3xl text-ink">
          Delete your account?
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This erases <span className="text-ink">{user?.email}</span>, your display name, every
          custom order you have saved and all of your watch progress. It happens immediately and
          cannot be undone.
        </p>

        <label className="mt-5 block">
          <span className="label text-ink">Confirm your password</span>
          <input
            ref={inputRef}
            type="password"
            name="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field mt-1.5"
          />
        </label>

        {error && (
          <p role="alert" className="mt-2 text-sm leading-relaxed text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={isDeleting}
            className="btn btn-danger"
          >
            {isDeleting ? 'Deleting…' : 'Delete my account'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
