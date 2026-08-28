import { describe, expect, it } from 'vitest'

import { creditScenesLabel } from './format'

/**
 * The one subtlety in the credits-scene field: a catalog that has not checked a
 * title and a title that was checked and has nothing are different answers, and
 * folding them together is exactly the bug this label is here to prevent.
 */
describe('creditScenesLabel', () => {
  it('says nothing at all when the catalog has not recorded an answer', () => {
    expect(creditScenesLabel(null)).toBeNull()
    expect(creditScenesLabel(undefined)).toBeNull()
  })

  it('states a recorded zero rather than staying silent about it', () => {
    expect(creditScenesLabel(0)).toBe('No credits scene')
  })

  it('agrees with itself on the plural', () => {
    expect(creditScenesLabel(1)).toBe('1 credits scene')
    expect(creditScenesLabel(2)).toBe('2 credits scenes')
    expect(creditScenesLabel(5)).toBe('5 credits scenes')
  })
})
