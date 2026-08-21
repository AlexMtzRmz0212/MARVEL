import { createBrowserRouter } from 'react-router'

import { AppShell } from './components/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { CatalogPage } from './features/catalog/CatalogPage'
import { OrderBuilderPage } from './features/builder/OrderBuilderPage'
import { OrdersPage } from './features/builder/OrdersPage'
import { PrereqGraphPage } from './features/prereq/PrereqGraphPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { MovieDetailPage } from './pages/MovieDetailPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PrivacyPage } from './pages/legal/PrivacyPage'
import { TermsPage } from './pages/legal/TermsPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // The catalog is the landing page, rendered at "/" rather than reached by
      // a redirect: a redirect left the address bar on /catalog, so every
      // refresh and bookmark hit a path the app has to serve rather than the
      // bare domain. /catalog stays mounted so older links keep resolving.
      { index: true, element: <CatalogPage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'movies/:movieId', element: <MovieDetailPage /> },
      { path: 'movies/:movieId/prereqs', element: <PrereqGraphPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/new', element: <OrderBuilderPage /> },
      { path: 'orders/:orderId', element: <OrderBuilderPage /> },
      { path: 'timeline', element: <TimelinePage /> },
      { path: 'progress', element: <ProgressPage /> },
      // Inside the shell rather than beside it: the header belongs on both, and
      // there is no route to guard — every page above works signed out, backed
      // by localStorage, exactly as it did before accounts existed.
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
