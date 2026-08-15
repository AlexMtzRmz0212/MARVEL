/**
 * The auth context and its hook, kept apart from the provider component.
 *
 * Not a stylistic split: `eslint-plugin-react-refresh` (enabled via
 * `reactRefresh.configs.vite`) refuses a module that exports both a component
 * and something else, because Fast Refresh cannot tell what to re-render.
 */

import { createContext, useContext } from 'react'

export const AuthContext = createContext({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
})

/** `user` is null for guests, which is a supported state everywhere in the app. */
export function useAuth() {
  return useContext(AuthContext)
}
