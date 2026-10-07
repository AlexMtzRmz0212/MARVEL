import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { OrdersPage } from './OrdersPage'

/**
 * A server that does not know the recommended-orders route answers 404, and
 * the shared error panel reads every 404 as a missing *title*. This page has to
 * say what actually failed, and keep the user's own orders usable.
 */

vi.mock('../../api/catalog', () => ({
  useMovies: () => ({ data: [], isPending: false, error: null }),
  useRecommendedOrders: () => ({
    data: undefined,
    isPending: false,
    error: Object.assign(new Error('Not Found'), { status: 404 }),
    refetch: () => {},
  }),
}))

vi.mock('../../api/userOrders', () => ({
  useOrders: () => ({ data: [], isPending: false, error: null }),
  useDeleteOrder: () => ({ mutate: () => {}, isPending: false }),
}))

describe('OrdersPage', () => {
  it('says the recommended orders failed, not that a title is missing', () => {
    render(
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the recommended orders")
    expect(screen.queryByText(/no title with that id/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // The saved-orders half of the page still renders.
    expect(screen.getByText('No saved orders yet')).toBeInTheDocument()
  })
})
