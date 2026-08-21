import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EditorApp } from './EditorApp'
import '../index.css'

/**
 * Entry point for the local catalog editor (`/editor.html`).
 *
 * Shares the app's stylesheet, so the tool reads in the same archive-dossier
 * language as the site it edits and there is no second palette to keep in sync.
 * It does not share the router, the auth provider or the API client: there is
 * one screen, nobody to sign in as, and a different backend.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The file can be changed underneath this tab by a text editor or a git
      // checkout, and coming back to the window is exactly when you would want
      // to know — the opposite of the shipped app, whose catalog is immutable
      // between deploys.
      refetchOnWindowFocus: true,
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EditorApp />
    </QueryClientProvider>
  </StrictMode>,
)
