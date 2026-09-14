import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext } from '../../auth/AuthContext'
import { markManyWatched, resetToLocalStorage } from '../../lib/watchStorage'
import { CompareProgressPage } from './CompareProgressPage'

/**
 * What this page claims is the four-way split, and it is the one thing here
 * that is easy to get quietly backwards: swap two branches of the bucket
 * ternary and every count still adds up to the catalog size. So the tests pin
 * which title lands in which bucket, that a filter really narrows the list
 * rather than restyling it, and that a revoked link reads as a sentence instead
 * of an error boundary.
 *
 * The split is now computed over any number of people, which gives the ternary
 * a second way to be quietly wrong: the two-person wording has to keep falling
 * out of the same branches the many-person wording uses. So the same catalogue
 * is asserted twice, once against a link and once against two friends, and the
 * second block pins the relabelling as well as the counts.
 */

const MOVIES = [
  { id: 'a', title: 'Alpha', saga: 'Infinity Saga', runtime_min: 120 },
  { id: 'b', title: 'Bravo', saga: 'Infinity Saga', runtime_min: 100 },
  { id: 'c', title: 'Charlie', saga: 'Multiverse Saga', runtime_min: 90 },
  { id: 'd', title: 'Delta', saga: 'Multiverse Saga', runtime_min: null },
]

vi.mock('../../api/catalog', () => ({
  useMovies: () => ({ data: MOVIES }),
}))

// Mutable handles so each test can decide what the link and the friends
// endpoints resolve to.
const sharedResult = { data: null, error: null, isPending: false }
const friendsResult = { data: [], isPending: false }
const friendsProgressResult = { data: [], isPending: false }

vi.mock('../../api/friends', () => ({
  useFriends: () => friendsResult,
  useFriendsProgress: () => friendsProgressResult,
}))

vi.mock('../../api/share', async (importOriginal) => ({
  // tokenFromInput is pure parsing and is worth exercising for real.
  ...(await importOriginal()),
  useMyShareLink: () => ({ data: { token: null }, isPending: false }),
  useCreateShareLink: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeShareLink: () => ({ mutate: vi.fn() }),
  useSharedProgress: () => sharedResult,
}))

function show({ user = { id: 'u1' }, url = '/progress/compare?with=tok' } = {}) {
  return render(
    <AuthContext.Provider value={{ user, isLoading: false }}>
      <MemoryRouter initialEntries={[url]}>
        <CompareProgressPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function rows(container) {
  return [...container.querySelectorAll('[data-row]')].map((node) => node.dataset.row)
}

/** The counts panel, which repeats the bucket names the chips and rows use. */
function counts() {
  const list = document.querySelector('dl')
  return Object.fromEntries(
    [...list.children].map((group) => [
      group.querySelector('dt').textContent,
      group.querySelector('dd').textContent,
    ]),
  )
}

beforeEach(() => {
  localStorage.clear()
  resetToLocalStorage()
  sharedResult.data = null
  sharedResult.error = null
  sharedResult.isPending = false
  friendsResult.data = []
  friendsProgressResult.data = []
})

describe('CompareProgressPage', () => {
  describe('with a link that resolves', () => {
    beforeEach(() => {
      // Mine: Alpha and Bravo. Theirs: Bravo and Charlie. Delta neither.
      markManyWatched(['a', 'b'])
      sharedResult.data = { display_name: 'Peter', watched_ids: ['b', 'c'] }
    })

    it('splits the catalog four ways', () => {
      show()

      expect(counts()).toEqual({
        Both: '1',
        'Only you': '1',
        'Only them': '1',
        Neither: '1',
      })
    })

    it('accounts for every title exactly once', () => {
      show()

      const total = Object.values(counts()).reduce((sum, value) => sum + Number(value), 0)
      expect(total).toBe(MOVIES.length)
    })

    it('names the other person over their column and on their own bar', () => {
      show()
      expect(screen.getAllByText('Peter')).toHaveLength(2)
    })

    it('narrows the list to one bucket at a time', () => {
      const { container } = show()

      expect(rows(container)).toEqual(['a', 'b', 'c', 'd'])

      fireEvent.click(screen.getByRole('button', { name: 'Only them' }))
      expect(rows(container)).toEqual(['c'])

      fireEvent.click(screen.getByRole('button', { name: 'Both' }))
      expect(rows(container)).toEqual(['b'])
    })

    it('offers the titles neither of you has seen as a new order', () => {
      const { container } = show()

      fireEvent.click(screen.getByRole('button', { name: 'Neither' }))
      expect(rows(container)).toEqual(['d'])

      const link = screen.getByRole('link', { name: /Build an order from these 1/ })
      expect(link).toHaveAttribute('href', expect.stringContaining('start=d'))
      expect(link.getAttribute('href')).toContain('Watching%20with%20Peter')
    })

    it('says which bucket each row is in, not just which dots are filled', () => {
      const { container } = show()

      const alpha = container.querySelector('[data-row="a"]')
      expect(within(alpha).getAllByText('Only you').length).toBeGreaterThan(0)
    })
  })

  describe('when the link does not resolve', () => {
    it('explains a revoked link rather than failing', () => {
      sharedResult.error = { status: 404 }
      show()

      expect(screen.getByText(/does not work any more/i)).toBeInTheDocument()
      expect(document.querySelector('dl')).toBeNull()
    })
  })

  describe('without anybody to compare against', () => {
    it('asks for somebody instead of comparing nothing', () => {
      show({ url: '/progress/compare' })

      expect(screen.getByText(/Pick a friend above, or paste a link/i)).toBeInTheDocument()
      expect(document.querySelector('dl')).toBeNull()
    })
  })

  describe('with friends picked from the list', () => {
    beforeEach(() => {
      // Mine: Alpha and Bravo. MJ: Bravo and Charlie. Ned: Bravo only.
      markManyWatched(['a', 'b'])
      friendsResult.data = [
        { user_id: 'f1', display_name: 'MJ', watched_count: 2 },
        { user_id: 'f2', display_name: 'Ned', watched_count: 1 },
      ]
      friendsProgressResult.data = [
        { user_id: 'f1', display_name: 'MJ', watched_ids: ['b', 'c'] },
        { user_id: 'f2', display_name: 'Ned', watched_ids: ['b'] },
      ]
    })

    it('relabels the buckets once there is more than one other person', () => {
      show({ url: '/progress/compare?friends=f1,f2' })

      // Bravo is the only title all three have. Alpha is yours alone. Charlie
      // is MJ's alone, which is "some of you" rather than "only them" now.
      // Delta is nobody's.
      expect(counts()).toEqual({
        Everyone: '1',
        'Only you': '1',
        'Some of you': '1',
        Nobody: '1',
      })
    })

    it('draws a column per person and names them in the legend', () => {
      const { container } = show({ url: '/progress/compare?friends=f1,f2' })

      expect(screen.getByText('1 You')).toBeInTheDocument()
      expect(screen.getByText('2 MJ')).toBeInTheDocument()
      expect(screen.getByText('3 Ned')).toBeInTheDocument()

      // Three marks on every row, one per person, plus the position.
      const bravo = container.querySelector('[data-row="b"]')
      expect(bravo.querySelectorAll('[aria-hidden="true"]').length).toBe(3)
    })

    it('drops a friend id that no longer resolves rather than rendering a blank column', () => {
      show({ url: '/progress/compare?friends=f1,gone' })

      expect(screen.getAllByText('MJ').length).toBeGreaterThan(0)
      // Back to two people, so the two-person wording comes back with it.
      expect(counts()).toEqual({
        Both: '1',
        'Only you': '1',
        'Only them': '1',
        Neither: '1',
      })
    })

    it('compares a friend and a link at once', () => {
      sharedResult.data = { display_name: 'Peter', watched_ids: ['a', 'b'] }
      show({ url: '/progress/compare?friends=f1&with=tok' })

      // You and Peter have Alpha and Bravo; MJ has Bravo and Charlie.
      expect(counts()).toEqual({
        Everyone: '1',
        'Only you': '0',
        'Some of you': '2',
        Nobody: '1',
      })
    })
  })

  describe('signed out', () => {
    it('offers sign-in for the outgoing half and still follows a link', () => {
      sharedResult.data = { display_name: null, watched_ids: ['a'] }
      show({ user: null })

      expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
      // The comparison itself still renders: a guest has local progress, and
      // there is nothing to sign in for in order to read somebody else's link.
      expect(counts()).toEqual({
        Both: '0',
        'Only you': '0',
        'Only them': '1',
        Neither: '3',
      })
    })
  })
})
