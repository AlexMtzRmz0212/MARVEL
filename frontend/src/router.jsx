import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from './components/AppShell'
import { CatalogPage } from './features/catalog/CatalogPage'
import { OrderBuilderPage } from './features/builder/OrderBuilderPage'
import { OrdersPage } from './features/builder/OrdersPage'
import { PrereqGraphPage } from './features/prereq/PrereqGraphPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { MovieDetailPage } from './pages/MovieDetailPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/catalog" replace /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'movies/:movieId', element: <MovieDetailPage /> },
      { path: 'movies/:movieId/prereqs', element: <PrereqGraphPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/new', element: <OrderBuilderPage /> },
      { path: 'orders/:orderId', element: <OrderBuilderPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
