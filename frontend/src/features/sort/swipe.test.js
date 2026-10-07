import { describe, expect, it } from 'vitest'

import { statusOf } from '../../lib/watchStorage'
import { buildQueue, decideSwipe, swipeIntent } from './swipe'

const CARD = { width: 300, height: 450 }

describe('decideSwipe', () => {
  it('commits a long drag in each meaningful direction', () => {
    expect(decideSwipe({ ...CARD, dx: 120, dy: 10 })).toBe('right')
    expect(decideSwipe({ ...CARD, dx: -120, dy: -10 })).toBe('left')
    expect(decideSwipe({ ...CARD, dx: 5, dy: 120 })).toBe('down')
  })

  it('snaps back from a short, slow drag', () => {
    expect(decideSwipe({ ...CARD, dx: 50, dy: 0 })).toBeNull()
    expect(decideSwipe({ ...CARD, dx: 0, dy: 60 })).toBeNull()
  })

  it('never records anything for an upward drag', () => {
    expect(decideSwipe({ ...CARD, dx: 0, dy: -300, vy: -2 })).toBeNull()
  })

  it('accepts a short flick when it is fast enough', () => {
    expect(decideSwipe({ ...CARD, dx: 40, dy: 0, vx: 1 })).toBe('right')
    expect(decideSwipe({ ...CARD, dx: -40, dy: 0, vx: -1 })).toBe('left')
    expect(decideSwipe({ ...CARD, dx: 0, dy: 40, vy: 1 })).toBe('down')
  })

  it('ignores a flick that runs against the drag', () => {
    expect(decideSwipe({ ...CARD, dx: 40, dy: 0, vx: -1 })).toBeNull()
  })

  it('treats a tap as a tap, however fast the finger was', () => {
    expect(decideSwipe({ ...CARD, dx: 10, dy: 0, vx: 3 })).toBeNull()
  })

  it('decides by the dominant axis', () => {
    expect(decideSwipe({ ...CARD, dx: 100, dy: 140 })).toBe('down')
    expect(decideSwipe({ ...CARD, dx: -140, dy: 100 })).toBe('left')
  })

  it('does not get hair-trigger on a small card', () => {
    expect(decideSwipe({ width: 100, height: 150, dx: 40, dy: 0 })).toBeNull()
  })
})

describe('swipeIntent', () => {
  it('grows towards 1 as the drag nears its threshold', () => {
    expect(swipeIntent(45, 0, CARD.width, CARD.height)).toEqual({ direction: 'right', strength: 0.5 })
    expect(swipeIntent(900, 0, CARD.width, CARD.height).strength).toBe(1)
  })

  it('has no direction at rest or going up', () => {
    expect(swipeIntent(0, 0, CARD.width, CARD.height).direction).toBeNull()
    expect(swipeIntent(0, -50, CARD.width, CARD.height).direction).toBeNull()
  })
})

describe('buildQueue', () => {
  const movies = [
    { id: 'a', media_type: 'film', phase: 1 },
    { id: 'b', media_type: 'series', phase: 1 },
    { id: 'c', media_type: 'film', phase: 2 },
    { id: 'd', media_type: 'film', phase: 2 },
  ]
  const progress = {
    a: { watched_at: '2026-01-01T00:00:00Z' },
    c: { status: 'unsure' },
  }
  const all = { mode: 'unsorted', kind: 'all', phase: null }

  it('deals only titles nobody has sorted, in the order given', () => {
    expect(buildQueue(movies, progress, all, statusOf)).toEqual(['b', 'd'])
  })

  it('deals the "don\'t recall" pile when revisiting', () => {
    expect(buildQueue(movies, progress, { ...all, mode: 'revisit' }, statusOf)).toEqual(['c'])
  })

  it('narrows by media type and phase', () => {
    expect(buildQueue(movies, progress, { ...all, kind: 'series' }, statusOf)).toEqual(['b'])
    expect(buildQueue(movies, progress, { ...all, phase: 2 }, statusOf)).toEqual(['d'])
  })
})
