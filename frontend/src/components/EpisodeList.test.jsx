import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { getSnapshot, isWatched, resetToLocalStorage } from '../lib/watchStorage'
import { EpisodeList } from './EpisodeList'

const SHOW = {
  id: 'wandavision',
  title: 'WandaVision',
  episodes: [
    { season: 1, episode: 1, name: 'Filmed Before a Live Studio Audience', runtime_min: 30, air_date: null },
    { season: 1, episode: 2, name: "Don't Touch That Dial", runtime_min: 36, air_date: null },
    { season: 1, episode: 3, name: 'Now in Color', runtime_min: 38, air_date: null },
  ],
  credit_scene_episodes: [{ episode: 3, name: 'Now in Color', count: 1, note: null }],
}

beforeEach(() => {
  localStorage.clear()
  resetToLocalStorage()
})

describe('EpisodeList', () => {
  it('ticks episodes and marks the series watched on the last one', () => {
    render(<EpisodeList movie={SHOW} />)
    expect(screen.getByText('0 of 3 watched')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/Filmed Before/))
    fireEvent.click(screen.getByLabelText(/Touch That Dial/))
    expect(screen.getByText('2 of 3 watched')).toBeInTheDocument()
    expect(isWatched(getSnapshot(), 'wandavision')).toBe(false)

    fireEvent.click(screen.getByLabelText(/Now in Color/))
    expect(isWatched(getSnapshot(), 'wandavision')).toBe(true)
  })

  it('marks everything up to an episode in one go', () => {
    render(<EpisodeList movie={SHOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark episodes 1 to 2 watched' }))
    expect(getSnapshot().wandavision.episodes).toEqual([1, 2])
  })

  it('flags the next episode and the one with a credits scene', () => {
    render(<EpisodeList movie={SHOW} />)
    fireEvent.click(screen.getByLabelText(/Filmed Before/))

    const next = screen.getByText('Next')
    expect(next.closest('label')).toHaveTextContent("Don't Touch That Dial")
    expect(screen.getByText('Stay for the credits')).toBeInTheDocument()
  })
})
