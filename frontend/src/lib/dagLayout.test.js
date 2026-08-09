import { describe, expect, it } from 'vitest'

import { DEFAULTS, layoutDag } from './dagLayout'

/** Build nodes tersely: node('a', 2) is id 'a' at depth 2. */
function node(id, depth, chrono = 0) {
  return { id, depth, chrono_order: chrono, title: id }
}

function edge(from, to, strength = 'essential') {
  return { from, to, strength }
}

describe('layoutDag', () => {
  it('returns an empty layout for no nodes', () => {
    const layout = layoutDag([], [])
    expect(layout.nodes).toEqual([])
    expect(layout.paths).toEqual([])
    expect(layout.width).toBe(0)
  })

  it('places a lone target node', () => {
    const layout = layoutDag([node('target', 0)], [])
    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0].x).toBe(DEFAULTS.padding)
  })

  it('puts the target on the right and deep prerequisites on the left', () => {
    const nodes = [node('target', 0), node('mid', 1), node('deep', 2)]
    const layout = layoutDag(nodes, [edge('deep', 'mid'), edge('mid', 'target')])

    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
    expect(byId.deep.x).toBeLessThan(byId.mid.x)
    expect(byId.mid.x).toBeLessThan(byId.target.x)
  })

  it('gives every node in a column the same x', () => {
    const nodes = [node('target', 0), node('a', 1, 1), node('b', 1, 2), node('c', 1, 3)]
    const layout = layoutDag(nodes, [
      edge('a', 'target'),
      edge('b', 'target'),
      edge('c', 'target'),
    ])

    const columnX = layout.nodes.filter((n) => n.depth === 1).map((n) => n.x)
    expect(new Set(columnX).size).toBe(1)
  })

  it('never overlaps two nodes', () => {
    const nodes = [
      node('target', 0),
      node('a', 1, 1),
      node('b', 1, 2),
      node('c', 2, 3),
      node('d', 2, 4),
      node('e', 3, 5),
    ]
    const layout = layoutDag(nodes, [
      edge('a', 'target'),
      edge('b', 'target'),
      edge('c', 'a'),
      edge('d', 'b'),
      edge('e', 'c'),
    ])

    const positions = layout.nodes.map((n) => `${n.x},${n.y}`)
    expect(new Set(positions).size).toBe(positions.length)

    // Within a column, nodes must be at least one row apart.
    for (const depth of new Set(nodes.map((n) => n.depth))) {
      const ys = layout.nodes
        .filter((n) => n.depth === depth)
        .map((n) => n.y)
        .sort((p, q) => p - q)
      for (let i = 1; i < ys.length; i += 1) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(DEFAULTS.nodeHeight)
      }
    }
  })

  it('keeps every coordinate positive so the viewBox starts at the origin', () => {
    const nodes = [node('target', 0), node('a', 1, 1), node('b', 1, 2), node('c', 1, 3)]
    const layout = layoutDag(nodes, [
      edge('a', 'target'),
      edge('b', 'target'),
      edge('c', 'target'),
    ])

    for (const positioned of layout.nodes) {
      expect(positioned.x).toBeGreaterThanOrEqual(0)
      expect(positioned.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('sizes the canvas to contain every node', () => {
    const nodes = [node('target', 0), node('a', 1, 1), node('b', 1, 2)]
    const layout = layoutDag(nodes, [edge('a', 'target'), edge('b', 'target')])

    for (const positioned of layout.nodes) {
      expect(positioned.x + layout.nodeWidth).toBeLessThanOrEqual(layout.width)
      expect(positioned.y + layout.nodeHeight).toBeLessThanOrEqual(layout.height)
    }
  })

  it('draws every edge left to right, never backwards', () => {
    const nodes = [node('target', 0), node('mid', 1), node('deep', 2), node('deeper', 3)]
    const edges = [
      edge('mid', 'target'),
      edge('deep', 'mid'),
      edge('deeper', 'deep'),
      // A shortcut edge spanning three columns must still point forwards.
      edge('deeper', 'target'),
    ]
    const layout = layoutDag(nodes, edges)
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))

    expect(layout.paths).toHaveLength(4)
    for (const path of layout.paths) {
      expect(byId[path.from].x).toBeLessThan(byId[path.to].x)
    }
  })

  it('drops edges whose endpoints are not in the node set', () => {
    const layout = layoutDag([node('target', 0), node('a', 1)], [
      edge('a', 'target'),
      edge('ghost', 'target'),
    ])
    expect(layout.paths).toHaveLength(1)
  })

  it('carries edge strength through to the path, for dashed rendering', () => {
    const layout = layoutDag(
      [node('target', 0), node('a', 1)],
      [edge('a', 'target', 'recommended')],
    )
    expect(layout.paths[0].strength).toBe('recommended')
  })

  it('is deterministic across input order', () => {
    const nodes = [node('target', 0), node('a', 1, 3), node('b', 1, 1), node('c', 2, 2)]
    const edges = [edge('a', 'target'), edge('b', 'target'), edge('c', 'a')]

    const first = layoutDag(nodes, edges)
    const second = layoutDag([...nodes].reverse(), [...edges].reverse())

    const positionsOf = (layout) =>
      Object.fromEntries(layout.nodes.map((n) => [n.id, `${n.x},${n.y}`]))
    expect(positionsOf(second)).toEqual(positionsOf(first))
  })

  it('orders a column by chronology when the heuristic has no opinion', () => {
    const nodes = [node('target', 0), node('later', 1, 9), node('earlier', 1, 1)]
    const layout = layoutDag(nodes, [edge('later', 'target'), edge('earlier', 'target')])

    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
    expect(byId.earlier.y).toBeLessThan(byId.later.y)
  })
})
