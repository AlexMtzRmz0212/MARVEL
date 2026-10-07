import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CatalogPage } from './CatalogPage'

/**
 * The catalog's filters are the URL, and the URL is what reaches the API. What
 * is worth pinning is that every filter the backend supports gets there -- the
 * universe, the alphabetical order, every saga -- and that the choices offered
 * are the ones the catalog actually contains.
 */

const MOVIES = [
  { id: 'iron-man', title: 'Iron Man', phase: 1, saga: 'Infinity Saga', universe: 'Earth-199999', media_type: 'film', tier: 'core', release_date: '2008-05-02' },
  { id: 'loki', title: 'Loki', phase: 4, saga: 'Multiverse Saga', universe: 'Multiverse / TVA', media_type: 'series', tier: 'core', release_date: '2021-06-09' },
  { id: 'x-men', title: 'X-Men', phase: null, saga: 'Fox X-Men Saga', universe: 'Earth-10005', media_type: 'film', tier: 'optional', release_date: '2000-07-14' },
]

const calls = []

vi.mock('../../api/catalog', () => ({
  useMovies: (params) => {
    calls.push(params)
    return { data: MOVIES, isPending: false, error: null, refetch: () => {} }
  },
}))

function show(url = '/catalog') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CatalogPage />
    </MemoryRouter>,
  )
}

const lastFiltered = () => calls.filter((params) => Object.keys(params).length > 1).at(-1)

beforeEach(() => {
  calls.length = 0
})

describe('CatalogPage filters', () => {
  it('sends the universe from the URL to the API', () => {
    show('/catalog?universe=Earth-10005')
    expect(lastFiltered()).toEqual({ order: 'release', universe: 'Earth-10005' })
  })

  it('offers alphabetical order and sends it as order=title', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'A-Z' }))
    expect(calls.at(-1)).toMatchObject({ order: 'title' })
    expect(screen.getByRole('button', { name: 'A-Z' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('builds the saga and universe choices from the catalog itself', () => {
    show()
    const saga = screen.getByLabelText('Saga')
    const sagas = [...saga.querySelectorAll('option')].map((option) => option.value)
    // The two main sagas lead, then everything else alphabetically.
    expect(sagas).toEqual(['', 'Infinity Saga', 'Multiverse Saga', 'Fox X-Men Saga'])

    fireEvent.change(screen.getByLabelText('Universe'), { target: { value: 'Multiverse / TVA' } })
    expect(lastFiltered()).toMatchObject({ universe: 'Multiverse / TVA' })
  })

  it('only offers phases the catalog has', () => {
    show()
    const phases = screen.getByRole('group', { name: 'Phase' })
    expect([...phases.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      '1',
      '4',
    ])
  })
})
