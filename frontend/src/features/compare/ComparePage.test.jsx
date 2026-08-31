import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ComparePage } from './ComparePage'

/**
 * What is worth testing here is the join, not the lists.
 *
 * The two orders come from the API already sorted, so rendering them is not a
 * claim this page makes. What it does claim is that a title's two positions are
 * paired correctly -- one thread each, and a readout that says which way and
 * how far it moved -- and that the key really takes a line away rather than
 * hiding it in place. Both are easy to get subtly backwards, and both are the
 * whole feature.
 */

// Delta is a series: `runtime_min` is null for every one of them in the real
// catalog, which is what the running total has to cope with.
const RELEASE = [
  { id: 'a', title: 'Alpha', saga: 'Infinity Saga', release_date: '2008-05-02', runtime_min: 126 },
  { id: 'b', title: 'Bravo', saga: 'Infinity Saga', release_date: '2011-07-22', runtime_min: 124 },
  {
    id: 'c',
    title: 'Charlie',
    saga: 'Multiverse Saga',
    release_date: '2019-03-08',
    runtime_min: 130,
  },
  {
    id: 'd',
    title: 'Delta',
    saga: 'Multiverse Saga',
    release_date: '2021-07-09',
    runtime_min: null,
  },
]

// Charlie jumps from third to first, Bravo falls from second to last.
const CHRONO = [RELEASE[2], RELEASE[0], RELEASE[3], RELEASE[1]]

vi.mock('../../api/catalog', () => ({
  useMovies: ({ order }) => ({ data: order === 'chronological' ? CHRONO : RELEASE }),
}))

function show() {
  return render(
    <MemoryRouter>
      <ComparePage />
    </MemoryRouter>,
  )
}

/** The two spines, in document order: release first, then the chronology. */
function columns(container) {
  return [...container.querySelectorAll('ol')].map((list) =>
    [...within(list).getAllByRole('button')].map((button) => button.dataset.row),
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('ComparePage', () => {
  it('puts the same titles on both lines, in their own orders', () => {
    const { container } = show()

    expect(columns(container)).toEqual([
      ['a', 'b', 'c', 'd'],
      ['c', 'a', 'd', 'b'],
    ])
  })

  it('draws exactly one thread per title', () => {
    const { container } = show()

    expect(container.querySelectorAll('path')).toHaveLength(RELEASE.length)
  })

  it('reads out both positions and which way the title moved', () => {
    const { container } = show()

    fireEvent.click(container.querySelector('[data-row="c"]'))
    expect(screen.getByText(/#3 release .* #1 chronological .* 2 earlier/)).toBeInTheDocument()

    fireEvent.click(container.querySelector('[data-row="b"]'))
    expect(screen.getByText(/#2 release .* #4 chronological .* 2 later/)).toBeInTheDocument()
  })

  it('dates the release line only', () => {
    const { container } = show()
    const [release, chrono] = [...container.querySelectorAll('ol')]

    // Charlie is third by release and first in the chronology. The date rides
    // the release line, where it is the axis; on the chronology it would be a
    // fact the thread already carries.
    expect(within(release).getAllByRole('button')[2]).toHaveTextContent('8 Mar 2019')
    expect(within(chrono).getAllByRole('button')[0]).not.toHaveTextContent('8 Mar 2019')

    fireEvent.click(screen.getByRole('button', { name: 'Key' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Release dates' }))
    expect(screen.queryByText('8 Mar 2019')).not.toBeInTheDocument()
  })

  it('runs the clock down the chronology, and floors the total past a series', () => {
    const { container } = show()
    const [, chrono] = [...container.querySelectorAll('ol')]

    // 130m, then +126m. Delta has no runtime on file, so the total does not
    // advance across it and every figure from there on is an at-least.
    const clock = within(chrono)
      .getAllByRole('button')
      .map((button) => button.lastElementChild.textContent)
    expect(clock).toEqual(['2h', '4h', '4h+', '6h+'])

    fireEvent.click(screen.getByRole('button', { name: 'Key' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Running time' }))
    expect(screen.queryByText('6h+')).not.toBeInTheDocument()
  })

  it('takes a line away from the key, and the threads with it', () => {
    const { container } = show()

    fireEvent.click(screen.getByRole('button', { name: 'Key' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Chronological' }))

    expect(columns(container)).toEqual([['a', 'b', 'c', 'd']])
    // A thread with one end missing joins nothing, so it is not drawn -- and
    // the switch for it says so rather than pretending it still applies.
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(screen.getByRole('switch', { name: 'Connections' })).toBeDisabled()
  })

  it('keeps both lines up but drops the threads when connections are off', () => {
    const { container } = show()

    fireEvent.click(screen.getByRole('button', { name: 'Key' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Connections' }))

    expect(columns(container)).toHaveLength(2)
    expect(container.querySelectorAll('path')).toHaveLength(0)
  })
})
