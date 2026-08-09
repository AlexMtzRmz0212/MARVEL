import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from './components/AppShell'
import { CatalogPage } from './features/catalog/CatalogPage'
import { PrereqGraphPage } from './features/prereq/PrereqGraphPage'
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
