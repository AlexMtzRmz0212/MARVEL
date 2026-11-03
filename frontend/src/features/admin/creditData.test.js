import { describe, expect, it } from 'vitest'

import { CHECKED, cleanCredits, toDraft } from './creditData'

describe('credit scenes', () => {
  it('keeps "not checked" apart from "nothing after the credits"', () => {
    expect(cleanCredits(null, false)).toBeNull()
    expect(toDraft(undefined)).toBeNull()
    expect(cleanCredits({ ...CHECKED, count: 0 }, false)).toEqual({ count: 0 })
  })

  it('writes a film as a count, with a note only when there is one', () => {
    expect(cleanCredits({ count: 2, note: '  ', episodes: [] }, false)).toEqual({ count: 2 })
    expect(cleanCredits({ count: 1, note: ' Thanos ', episodes: [] }, false)).toEqual({
      count: 1,
      note: 'Thanos',
    })
  })

  it('treats a blank count on a checked title as none, and caps it at five', () => {
    expect(cleanCredits({ count: '', note: '', episodes: [] }, false)).toEqual({ count: 0 })
    expect(cleanCredits({ count: 9, note: '', episodes: [] }, false)).toEqual({ count: 5 })
  })

  it('writes a series as its episodes, in broadcast order, with no count beside them', () => {
    const draft = {
      count: 3,
      note: '',
      episodes: [
        { episode: 9, name: '', count: 1, note: '' },
        { episode: 3, name: 'Pilot', count: 2, note: 'Mid-credits' },
      ],
    }
    expect(cleanCredits(draft, true)).toEqual({
      episodes: [
        { episode: 3, name: 'Pilot', count: 2, note: 'Mid-credits' },
        { episode: 9, count: 1 },
      ],
    })
  })

  it('drops an episode row with no usable number rather than failing the save', () => {
    const draft = {
      count: 0,
      note: '',
      episodes: [
        { episode: '', name: 'half-typed', count: 1, note: '' },
        { episode: 4, name: '', count: 1, note: '' },
      ],
    }
    expect(cleanCredits(draft, true)).toEqual({ episodes: [{ episode: 4, count: 1 }] })
  })

  it('writes a series with an empty list as a plain total', () => {
    expect(cleanCredits({ count: 0, note: '', episodes: [] }, true)).toEqual({ count: 0 })
  })

  it('folds an episode list into a total once the title is no longer a series', () => {
    const draft = {
      count: 0,
      note: '',
      episodes: [
        { episode: 1, name: '', count: 2, note: '' },
        { episode: 2, name: '', count: 1, note: '' },
      ],
    }
    expect(cleanCredits(draft, false)).toEqual({ count: 3 })
  })

  it('round-trips what the catalog stores', () => {
    const stored = { episodes: [{ episode: 10, name: 'Part 3', count: 1 }] }
    expect(cleanCredits(toDraft(stored), true)).toEqual(stored)
    expect(cleanCredits(toDraft({ count: 1, note: 'After' }), false)).toEqual({
      count: 1,
      note: 'After',
    })
  })
})
