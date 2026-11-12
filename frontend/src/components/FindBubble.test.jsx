import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FindBubble } from './FindBubble'
import { TitleLocator } from './TitleLocator'

const MOVIES = [
  { id: 'iron-man', title: 'Iron Man', release_date: '2008-05-02' },
  { id: 'iron-man-2', title: 'Iron Man 2', release_date: '2010-05-07' },
  { id: 'thor', title: 'Thor', release_date: '2011-05-06' },
]

beforeEach(() => {
  // jsdom has neither; no motion is the right answer here.
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
})
afterEach(cleanup)

function bubble(props = {}) {
  const onClose = vi.fn()
  const onPick = vi.fn()
  render(
    <MemoryRouter>
      <FindBubble movies={MOVIES} onClose={onClose} onPick={onPick} {...props} />
    </MemoryRouter>,
  )
  return { onClose, onPick, input: screen.getByRole('searchbox') }
}

describe('FindBubble', () => {
  it('lists nothing until something is typed, then the matching titles', () => {
    const { input } = bubble()
    expect(screen.queryByRole('button', { name: /Iron Man/ })).toBeNull()

    fireEvent.change(input, { target: { value: 'iron' } })
    expect(screen.getAllByRole('button', { name: /Iron Man/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Thor/ })).toBeNull()
  })

  it('says so when nothing matches', () => {
    const { input } = bubble()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('Enter picks the highlighted match and closes; arrows move the highlight', () => {
    const { input, onPick, onClose } = bubble()
    fireEvent.change(input, { target: { value: 'iron' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onPick).toHaveBeenCalledWith(MOVIES[1])
    expect(onClose).toHaveBeenCalledWith('pick')
  })

  it('Escape closes, saying why, so the page can take the keyboard back', () => {
    const { input, onClose } = bubble()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith('escape')
  })

  it('reports what is typed, for a page whose own search it stands in for', () => {
    const onQuery = vi.fn()
    const { input } = bubble({ onQuery })
    fireEvent.change(input, { target: { value: 'thor' } })
    expect(onQuery).toHaveBeenCalledWith('thor')
  })

  it('with renderPicked, stays open and shows the page\'s own answer', () => {
    const { input, onPick, onClose } = bubble({
      renderPicked: (movie) => <p>Where {movie.title} is</p>,
    })
    fireEvent.change(input, { target: { value: 'thor' } })
    fireEvent.click(screen.getByRole('button', { name: /Thor/ }))

    expect(screen.getByText('Where Thor is')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Search again' }))
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})

describe('TitleLocator', () => {
  it('links the poster to the title and every place to its page', () => {
    const onNavigate = vi.fn()
    render(
      <MemoryRouter>
        <TitleLocator
          movie={MOVIES[2]}
          lines={[
            { key: 'a', group: 'Recommended', label: 'Release order', detail: '#3 of 3', to: '/orders/recommended/release' },
          ]}
          onNavigate={onNavigate}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Open Thor' })).toHaveAttribute('href', '/movies/thor')
    const line = screen.getByRole('link', { name: /Release order/ })
    expect(line).toHaveAttribute('href', '/orders/recommended/release')
    expect(screen.getByText('#3 of 3')).toBeInTheDocument()

    fireEvent.click(line)
    expect(onNavigate).toHaveBeenCalled()
  })

  it('says what to do when a title is nowhere', () => {
    render(
      <MemoryRouter>
        <TitleLocator movie={MOVIES[2]} lines={[]} empty="Not in any order yet." />
      </MemoryRouter>,
    )
    expect(screen.getByText('Not in any order yet.')).toBeInTheDocument()
  })
})
