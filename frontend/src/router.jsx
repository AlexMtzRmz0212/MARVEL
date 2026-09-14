import { createBrowserRouter } from 'react-router'

import { AppShell } from './components/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { CatalogPage } from './features/catalog/CatalogPage'
import { ComparePage } from './features/compare/ComparePage'
import { FriendProfilePage } from './features/friends/FriendProfilePage'
import { FriendsPage } from './features/friends/FriendsPage'
import { HomePage } from './features/home/HomePage'
import { OrderBuilderPage } from './features/builder/OrderBuilderPage'
import { OrdersPage } from './features/builder/OrdersPage'
import { PrereqGraphPage } from './features/prereq/PrereqGraphPage'
import { CompareProgressPage } from './features/progress/CompareProgressPage'
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
      // "/" is the landing page and "/catalog" is the catalog, both rendered
      // rather than redirected: a redirect would leave the address bar on a
      // path the app has to serve, so every refresh and bookmark would go
      // through it. The catalog kept this route from the days when it was the
      // landing page, so no old link breaks.
      { index: true, element: <HomePage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'movies/:movieId', element: <MovieDetailPage /> },
      { path: 'movies/:movieId/prereqs', element: <PrereqGraphPage /> },
      { path: 'friends', element: <FriendsPage /> },
      // A friend's profile is addressed by their account id rather than by
      // anything guessable, and the page renders nothing at all unless the two
      // are still friends -- so a leaked url is a sentence, not a disclosure.
      { path: 'friends/:friendId', element: <FriendProfilePage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/new', element: <OrderBuilderPage /> },
      { path: 'orders/:orderId', element: <OrderBuilderPage /> },
      { path: 'timeline', element: <TimelinePage /> },
      { path: 'progress', element: <ProgressPage /> },
      // The share link people are handed is this path with `?with=<token>`.
      // One route, no redirect hop, and the parameter is naturally optional:
      // without it the page is "here is your link, or paste theirs".
      { path: 'progress/compare', element: <CompareProgressPage /> },
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
