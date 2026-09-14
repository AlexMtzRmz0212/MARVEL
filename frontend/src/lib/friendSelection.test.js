import { describe, expect, it } from 'vitest'

import {
  MAX_COMPARE_FRIENDS,
  friendIdsParam,
  parseFriendIds,
  toggleFriendId,
} from './friendSelection'

/**
 * The cap and the dedupe are the only two rules, and both of them only bite on
 * input the app never produces itself: a hand-edited query string, a bookmark
 * from before a friendship ended, a link somebody built by hand. That is exactly
 * why they are worth pinning here rather than trusting to the UI that normally
 * feeds them.
 */

describe('parseFriendIds', () => {
  it('reads a comma-separated list', () => {
    expect(parseFriendIds('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('treats an absent or empty parameter as nobody', () => {
    expect(parseFriendIds(null)).toEqual([])
    expect(parseFriendIds('')).toEqual([])
  })

  it('drops the empty segments a trailing comma leaves behind', () => {
    expect(parseFriendIds('a,,b,')).toEqual(['a', 'b'])
  })

  it('keeps one of each, so a duplicated id cannot occupy two columns', () => {
    expect(parseFriendIds('a,b,a')).toEqual(['a', 'b'])
  })

  it('refuses to exceed the cap however long the parameter is', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].join(',')
    expect(parseFriendIds(many)).toHaveLength(MAX_COMPARE_FRIENDS)
  })
})

describe('toggleFriendId', () => {
  it('adds an id that is not there', () => {
    expect(toggleFriendId(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes one that is', () => {
    expect(toggleFriendId(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('appends rather than reorders, so the columns stay put', () => {
    expect(toggleFriendId(['b', 'a'], 'c')).toEqual(['b', 'a', 'c'])
  })

  it('returns the same list when the cap is reached', () => {
    const full = ['a', 'b', 'c', 'd']
    expect(toggleFriendId(full, 'e')).toBe(full)
  })

  it('still removes at the cap, so the cap is not a trap', () => {
    expect(toggleFriendId(['a', 'b', 'c', 'd'], 'c')).toEqual(['a', 'b', 'd'])
  })
})

describe('friendIdsParam', () => {
  it('round-trips through parseFriendIds', () => {
    const ids = ['a', 'b', 'c']
    expect(parseFriendIds(friendIdsParam(ids))).toEqual(ids)
  })

  it('is empty for nobody, which the caller omits from the query string', () => {
    expect(friendIdsParam([])).toBe('')
  })
})
