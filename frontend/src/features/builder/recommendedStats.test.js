import { describe, expect, it } from 'vitest'

import { makeItMineHref, orderStats } from './recommendedStats'

const ORDER = { name: 'Road & back', movie_ids: ['iron-man', 'thor', 'the-avengers'] }

describe('orderStats', () => {
  it('counts what is watched and points at the first title that is not', () => {
    const progress = { 'iron-man': { watched_at: '2026-01-01T00:00:00Z' } }
    expect(orderStats(ORDER, progress)).toMatchObject({ watched: 1, total: 3, nextUp: 'thor' })
  })

  it('has nothing next once everything is watched', () => {
    const progress = Object.fromEntries(ORDER.movie_ids.map((id) => [id, { watched_at: 'x' }]))
    expect(orderStats(ORDER, progress).nextUp).toBeNull()
  })
})

describe('makeItMineHref', () => {
  it('hands the builder the ids and the name', () => {
    const url = new URL(makeItMineHref(ORDER), 'http://localhost')
    expect(url.pathname).toBe('/orders/new')
    expect(url.searchParams.get('start')).toBe('iron-man,thor,the-avengers')
    expect(url.searchParams.get('name')).toBe('Road & back')
  })
})
