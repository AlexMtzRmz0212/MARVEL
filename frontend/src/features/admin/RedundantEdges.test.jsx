import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RedundantEdges } from './RedundantEdges'

const movies = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Bravo' },
  { id: 'c', title: 'Charlie' },
  { id: 'd', title: 'Delta' },
]

const bare = { owner_id: 'c', prerequisite_id: 'a', strength: 'essential', note: null, via: 'b' }
const kept = { owner_id: 'd', prerequisite_id: 'a', strength: 'essential', note: 'Right before', via: 'b' }

describe('RedundantEdges', () => {
  it('renders nothing when there is nothing redundant', () => {
    const { container } = render(
      <RedundantEdges edges={[]} movies={movies} onRemove={() => {}} onRemoveAll={() => {}} />,
    )
    expect(container.childElementCount).toBe(0)
  })

  it('removes a single edge', () => {
    const onRemove = vi.fn()
    render(<RedundantEdges edges={[bare]} movies={movies} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: /Remove Alpha → Charlie/ }))

    expect(onRemove).toHaveBeenCalledWith([bare])
  })

  it('bulk removal leaves out edges that carry a note', () => {
    const onRemoveAll = vi.fn()
    render(
      <RedundantEdges
        edges={[bare, kept]}
        movies={movies}
        onRemove={() => {}}
        onRemoveAll={onRemoveAll}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove all 1 without a note/ }))

    expect(onRemoveAll).toHaveBeenCalledWith([bare])
  })
})
