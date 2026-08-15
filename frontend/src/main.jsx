import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { AuthProvider } from './auth/AuthProvider'
import { router } from './router'
import './index.css'

// Both of these are answers rather than failures: 404 means "no such title",
// 401 means "not signed in". Retrying either just triples the request count --
// and every guest page load asks /auth/me exactly once for a guaranteed 401.
const TERMINAL_STATUSES = [401, 404]

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The catalog does not change between deploys, so a refetch on every
      // window focus would be pure noise.
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !TERMINAL_STATUSES.includes(error?.status) && failureCount < 2,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
