import { describe, expect, it } from 'vitest'

import { DEFAULTS, boundsOf, buildGraph, createSimulation, seedPositions } from './forceGraph'

/** A catalog of `count` titles, `t0`..`tn`, already in chronological order. */
function catalog(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    title: `Title ${index}`,
    chrono_order: index,
  }))
}

function edge(from, to, strength = 'essential') {
  return { from: `t${from}`, to: `t${to}`, strength, note: null }
}

function settled(movies, edges, options) {
  const graph = buildGraph(movies, edges)
  seedPositions(graph, options)
  createSimulation(graph, options).settle(600)
  return graph
}

const depthOf = (graph) => new Map(graph.nodes.map((node) => [node.id, node.depth]))

describe('buildGraph', () => {
  it('measures depth by the longest path, not the shortest', () => {
    // t0 reaches t3 directly and also the long way round, through t1 and t2.
    const graph = buildGraph(catalog(4), [edge(0, 1), edge(1, 2), edge(2, 3), edge(0, 3)])
    expect(depthOf(graph).get('t3')).toBe(3)
  })

  it('puts a title with no prerequisites at the top', () => {
    const graph = buildGraph(catalog(3), [edge(0, 2)])
    const depth = depthOf(graph)
    expect(depth.get('t0')).toBe(0)
    expect(depth.get('t1')).toBe(0)
    expect(depth.get('t2')).toBe(1)
  })

  it('reads in catalog order wherever the edges allow it', () => {
    const graph = buildGraph(catalog(5), [edge(0, 3)])
    expect(graph.order).toEqual(['t0', 't1', 't2', 't3', 't4'])
  })

  it('reorders only as far as a dependency forces it', () => {
    const graph = buildGraph(catalog(4), [edge(3, 1)])
    expect(graph.order.indexOf('t3')).toBeLessThan(graph.order.indexOf('t1'))
  })

  it('keeps the stronger of two edges between the same pair', () => {
    const graph = buildGraph(catalog(3), [edge(0, 2, 'recommended'), edge(0, 2, 'essential')])
    expect(graph.links).toHaveLength(1)
    expect(graph.links[0].strength).toBe('essential')
  })

  it('drops self-links and edges pointing outside the catalog', () => {
    const graph = buildGraph(catalog(3), [
      edge(1, 1),
      { from: 't0', to: 'ghost', strength: 'essential' },
    ])
    expect(graph.links).toEqual([])
  })

  it('still returns every title if the edges somehow contain a cycle', () => {
    const graph = buildGraph(catalog(3), [edge(0, 1), edge(1, 0)])
    expect(graph.nodes).toHaveLength(3)
    expect(new Set(graph.order).size).toBe(3)
  })

  it('counts a degree from both directions', () => {
    const graph = buildGraph(catalog(4), [edge(0, 1), edge(1, 2), edge(1, 3)])
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    expect(byId.get('t1').degree).toBe(3)
  })
})

describe('seedPositions', () => {
  it('lands in the same place every time', () => {
    const links = [edge(0, 4), edge(1, 4), edge(4, 7), edge(2, 7)]
    const once = buildGraph(catalog(9), links)
    const twice = buildGraph(catalog(9), links)
    seedPositions(once)
    seedPositions(twice)

    expect(once.nodes.map((node) => [node.x, node.y])).toEqual(
      twice.nodes.map((node) => [node.x, node.y]),
    )
  })

  it('starts each title at the distance of its own depth', () => {
    const graph = buildGraph(catalog(4), [edge(0, 1), edge(1, 2)])
    seedPositions(graph)
    for (const node of graph.nodes) expect(node.x).toBe(node.depth * DEFAULTS.levelGap)
  })
})

describe('createSimulation', () => {
  const links = [
    edge(0, 5),
    edge(1, 5),
    edge(2, 6),
    edge(5, 9),
    edge(6, 9),
    edge(9, 14),
    edge(3, 14),
    edge(7, 11),
    edge(11, 14),
    edge(4, 8, 'recommended'),
    edge(8, 12),
  ]

  it('leaves every edge pointing forward once it settles, whichever way it runs', () => {
    for (const depthAxis of ['x', 'y']) {
      const graph = settled(catalog(16), links, { depthAxis })
      for (const link of graph.links) {
        expect(graph.nodes[link.target][depthAxis]).toBeGreaterThan(
          graph.nodes[link.source][depthAxis],
        )
      }
    }
  })

  it('turns the same graph on its side without reshaping it', () => {
    const across = settled(catalog(30), links, { depthAxis: 'x' })
    const down = settled(catalog(30), links, { depthAxis: 'y' })
    const box = (graph) => boundsOf(graph.nodes, 0)

    expect(Math.round(box(across).width)).toBe(Math.round(box(down).height))
    expect(Math.round(box(across).height)).toBe(Math.round(box(down).width))
  })

  it('separates every pair of titles', () => {
    const graph = settled(catalog(16), links)
    for (let i = 0; i < graph.nodes.length; i += 1) {
      for (let j = i + 1; j < graph.nodes.length; j += 1) {
        const distance = Math.hypot(
          graph.nodes[j].x - graph.nodes[i].x,
          graph.nodes[j].y - graph.nodes[i].y,
        )
        expect(distance).toBeGreaterThan(DEFAULTS.collideRadius * 2 - 1)
      }
    }
  })

  it('holds every title inside the band of its own depth', () => {
    const graph = settled(catalog(16), links)
    const room = DEFAULTS.levelGap * DEFAULTS.depthBand + 0.001
    for (const node of graph.nodes) {
      expect(Math.abs(node.x - node.depth * DEFAULTS.levelGap)).toBeLessThanOrEqual(room)
    }
  })

  it('cools to a stop rather than running forever', () => {
    const graph = buildGraph(catalog(16), links)
    seedPositions(graph)
    const simulation = createSimulation(graph)
    expect(simulation.settle(600)).toBeLessThanOrEqual(DEFAULTS.alphaMin)
  })

  it('pins a dragged title where it is put, and frees it again', () => {
    const graph = buildGraph(catalog(16), links)
    seedPositions(graph)
    const simulation = createSimulation(graph)
    simulation.settle(600)

    const node = graph.nodes[9]
    node.fx = node.depth * DEFAULTS.levelGap
    node.fy = 400
    simulation.reheat()
    simulation.settle(60)
    expect(node.y).toBe(400)

    simulation.release()
    simulation.reheat()
    simulation.settle(600)
    expect(node.fx).toBeNull()
    expect(node.y).not.toBe(400)
  })

  it('leaves a pinned title alone while everything else redistributes', () => {
    const graph = buildGraph(catalog(16), links)
    seedPositions(graph)
    const simulation = createSimulation(graph)
    simulation.settle(600)

    const pinned = graph.nodes[9]
    pinned.fx = pinned.x
    pinned.fy = pinned.y + 260
    const others = graph.nodes.filter((node) => node !== pinned).map((node) => node.y)

    simulation.reheat()
    simulation.settle(400)

    expect(pinned.y).toBe(pinned.fy)
    const moved = graph.nodes
      .filter((node) => node !== pinned)
      .filter((node, index) => Math.abs(node.y - others[index]) > 1)
    expect(moved.length).toBeGreaterThan(0)
  })

  it('will not let a drag carry a title out of its band', () => {
    const graph = buildGraph(catalog(16), links)
    seedPositions(graph)
    const simulation = createSimulation(graph)

    const node = graph.nodes.find((candidate) => candidate.depth === 1)
    node.fx = -5000
    node.fy = 0
    simulation.reheat()
    simulation.settle(10)

    const room = DEFAULTS.levelGap * DEFAULTS.depthBand + 0.001
    expect(Math.abs(node.x - node.depth * DEFAULTS.levelGap)).toBeLessThanOrEqual(room)
  })
})

describe('boundsOf', () => {
  it('wraps the graph with room for the labels', () => {
    const box = boundsOf([{ x: 0, y: 0 }, { x: 100, y: 40 }], 10)
    expect(box).toEqual({ x: -10, y: -10, width: 120, height: 60 })
  })

  it('survives an empty graph', () => {
    expect(boundsOf([]).width).toBe(1)
  })
})
