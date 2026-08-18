/**
 * Account endpoints.
 *
 * Nothing here handles the session token: it lives in an HttpOnly cookie the
 * browser attaches automatically, which is why `client.js` sets
 * `credentials: 'same-origin'` and why no code in this app ever sees it.
 */

import { api } from './client'

export function fetchMe() {
  return api('/auth/me')
}

export function register({ email, password, displayName }) {
  return api('/auth/register', {
    method: 'POST',
    body: { email, password, display_name: displayName || null },
  })
}

export function login({ email, password }) {
  return api('/auth/login', { method: 'POST', body: { email, password } })
}

export function logout() {
  return api('/auth/logout', { method: 'POST' })
}

/**
 * Erase the account and everything attached to it.
 *
 * The password goes up again even though the session cookie already identifies
 * the caller: this is the only irreversible action in the app.
 */
export function deleteAccount(password) {
  return api('/auth/me', { method: 'DELETE', body: { password } })
}

export function importLocalData(payload) {
  return api('/me/import', { method: 'POST', body: payload })
}

export function updatePreferences(preferences) {
  return api('/me/preferences', { method: 'PATCH', body: preferences })
}
