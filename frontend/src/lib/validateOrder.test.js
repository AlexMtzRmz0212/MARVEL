import { describe, expect, it } from 'vitest'

import fixture from '../../../fixtures/validation_cases.json'
import {
  completeOrder,
  createGraph,
  edgesFromApi,
  formatViolation,
  repairOrder,
  validateOrder,
} from './validateOrder'

/**
 * The drift guard.
 *
 * `backend/tests/test_graph_fixture.py` runs these exact cases against the
 * Python implementation. If this file and that one ever disagree, one of the
 * two validators has drifted and the builder is lying to somebody.
 */
const graph = createGraph(fixture.graph.nodes, fixture.graph.edges)
const titles = fixture.titles

describe('validateOrder conformance', () => {
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const expected = testCase.expected
      const result = validateOrder(graph, testCase.order)

      expect(result.is_valid).toBe(expected.is_valid)
      expect(result.has_warnings).toBe(expected.has_warnings)
      expect(result.checked_count).toBe(expected.checked_count)
      expect(result.violations).toEqual(expected.violations)
      expect(result.missing_prerequisite_ids).toEqual(expected.missing_prerequisite_ids)
      expect(result.unknown_ids).toEqual(expected.unknown_ids)
      expect(result.duplicate_ids).toEqual(expected.duplicate_ids)
      expect(result.suggested_order).toEqual(expected.suggested_order)
      expect(result.violations.map((v) => formatViolation(v, titles))).toEqual(expected.messages)
    })
  }
})

describe('completeOrder conformance', () => {
  for (const testCase of fixture.completion_cases) {
    it(testCase.name, () => {
      expect(completeOrder(graph, testCase.order)).toEqual(testCase.expected)
    })
  }

  it('always yields an order with no violations', () => {
    for (const testCase of fixture.completion_cases) {
      expect(validateOrder(graph, completeOrder(graph, testCase.order)).violations).toEqual([])
    }
  })
})

describe('repairOrder', () => {
  it('resolves every ordering violation without adding titles', () => {
    for (const testCase of fixture.cases) {
      const suggested = repairOrder(graph, testCase.order)
      const recheck = validateOrder(graph, suggested)
      expect(recheck.violations.filter((v) => v.kind === 'out_of_order')).toEqual([])

      const submitted = new Set(testCase.order.filter((id) => graph.has(id)))
      expect(new Set(suggested)).toEqual(submitted)
    }
  })
})

describe('createGraph', () => {
  it('collapses parallel edges, keeping the stronger declaration', () => {
    const built = createGraph({ a: 1, b: 2 }, [
      { movie_id: 'b', prerequisite_id: 'a', strength: 'recommended' },
      { movie_id: 'b', prerequisite_id: 'a', strength: 'essential' },
    ])
    expect(built.edges).toHaveLength(1)
    expect(built.strengthOf('a', 'b')).toBe('essential')
  })

  it('drops self edges and references to unknown titles', () => {
    const built = createGraph({ a: 1 }, [
      { movie_id: 'a', prerequisite_id: 'a', strength: 'essential' },
      { movie_id: 'a', prerequisite_id: 'ghost', strength: 'essential' },
    ])
    expect(built.edges).toEqual([])
  })
})

describe('edgesFromApi', () => {
  it('maps the wire shape onto the internal one', () => {
    expect(
      edgesFromApi([{ from: 'iron-man', to: 'the-avengers', strength: 'essential', note: 'x' }]),
    ).toEqual([
      {
        movie_id: 'the-avengers',
        prerequisite_id: 'iron-man',
        strength: 'essential',
        note: 'x',
      },
    ])
  })
})
