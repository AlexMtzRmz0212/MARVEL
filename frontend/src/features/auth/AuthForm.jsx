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

const inputClass = 'field mt-1.5'

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
      // The catalog rather than the landing page: someone who has just signed
      // in came here to use the thing, not to be sold it.
      navigate('/catalog')
    } catch (submitError) {
      setError(submitError.message ?? 'That did not work. Try again.')
      setIsBusy(false)
    }
  }

  return (
    <div className="panel benday mx-auto my-12 max-w-md p-6 sm:p-8">
      <h1 className="display text-5xl text-ink">{copy.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        An account syncs your saved orders and watch progress across devices. The catalog works
        without one.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="block">
          <span className="label text-ink">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            spellCheck={false}
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="label text-ink">Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          {isRegister && (
            <span className="mt-1.5 block text-sm leading-relaxed text-ink-dim">At least 8 characters.</span>
          )}
        </label>

        {isRegister && (
          <label className="block">
            <span className="label text-ink">Display name (optional)</span>
            <input
              type="text"
              name="display_name"
              maxLength={80}
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="border-2 border-danger border-l-[6px] bg-surface p-3 text-sm text-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="btn btn-primary mt-2 w-full"
        >
          {isBusy ? copy.busy : copy.submit}
        </button>
      </form>

      <p className="mt-6 text-sm leading-relaxed text-ink-dim">
        {copy.switchText}{' '}
        <Link to={copy.switchTo} className="font-semibold text-ink underline underline-offset-4 hover:decoration-2">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  )
}
