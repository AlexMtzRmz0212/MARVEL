import { describe, expect, it } from 'vitest'

import { creditScenesLabel, lineBulletFor } from './format'

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

describe('lineBulletFor', () => {
  it('prints the phase number on the saga line colour', () => {
    expect(lineBulletFor({ saga: 'Infinity Saga', phase: 3 })).toEqual({
      background: 'var(--color-infinity)',
      color: 'var(--color-on-infinity)',
      mark: '3',
      label: 'Infinity Saga, phase 3',
    })
  })

  it('falls back to the saga initial outside the phases', () => {
    const bullet = lineBulletFor({ saga: 'Fox X-Men Saga', phase: null })
    expect(bullet.mark).toBe('F')
    expect(bullet.label).toBe('Fox X-Men Saga')
    expect(bullet.background).toBe('var(--color-adjacent)')
  })
})
