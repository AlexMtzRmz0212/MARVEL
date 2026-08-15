/**
 * The sign-in and sign-up form.
 *
 * One component for both because the fields, the layout and the error handling
 * are identical — only the copy, the extra display-name field and which method
 * gets called differ.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'

const COPY = {
  login: {
    title: 'Sign in',
    submit: 'Sign in',
    busy: 'Signing in…',
    switchText: 'No account yet?',
    switchLabel: 'Create one',
    switchTo: '/register',
  },
  register: {
    title: 'Create an account',
    submit: 'Create account',
    busy: 'Creating…',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchTo: '/login',
  },
}

const inputClass =
  'hairline mt-1.5 w-full border bg-base px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink-faint'

export function AuthForm({ mode }) {
  const copy = COPY[mode]
  const isRegister = mode === 'register'

  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setIsBusy(true)
    try {
      if (isRegister) await signUp({ email, password, displayName })
      else await signIn({ email, password })
      navigate('/')
    } catch (submitError) {
      setError(submitError.message ?? 'That did not work. Try again.')
      setIsBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-medium tracking-tight text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        An account syncs your saved orders and watch progress across devices. The catalog works
        without one.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="block">
          <span className="meta">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="meta">Password</span>
          <input
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          {isRegister && <span className="meta mt-1.5 block">At least 8 characters.</span>}
        </label>

        {isRegister && (
          <label className="block">
            <span className="meta">Display name (optional)</span>
            <input
              type="text"
              maxLength={80}
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="hairline border border-l-2 border-l-danger bg-surface p-3 text-sm text-ink-dim">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="meta mt-2 border border-hairline-strong px-4 py-2.5 text-ink transition-colors hover:bg-raised disabled:opacity-50"
        >
          {isBusy ? copy.busy : copy.submit}
        </button>
      </form>

      <p className="meta mt-6">
        {copy.switchText}{' '}
        <Link to={copy.switchTo} className="text-ink-dim underline underline-offset-4 hover:text-ink">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  )
}
