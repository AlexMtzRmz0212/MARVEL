/**
 * A force-directed layout for the whole catalog, with a spine.
 *
 * The two obvious options are both wrong here. A plain force graph makes a
 * pretty cloud that says nothing about watch order — the one thing this catalog
 * is *for*. A fixed layered drawing says it perfectly and cannot be touched.
 *
 * So: forces on x, a constraint on y. Every title is pulled towards the height
 * of its own dependency depth, hard enough that prerequisites always sit above
 * the things that need them, while repulsion and the link springs are free to
 * arrange each band horizontally. Drag a title and it moves; let go and it
 * settles back into a position that still obeys the edges.
 *
 * Everything here is pure and frame-independent — `tick()` advances the
 * simulation by one step and mutates the node array in place — so the whole
 * thing runs headless in a test and gets measured, which is how the constants
 * below were chosen rather than guessed. Over the real catalog they settle in
 * 386 ticks to a layout with every one of the 139 edges pointing downward, no
 * overlapping nodes, and 144 edge crossings; the sweep that picked them is in
 * `forceGraph.test.js`, which asserts the first two of those forever.
 */

export const DEFAULTS = {
  /** Vertical distance between two dependency depths. */
  levelGap: 96,
  /** Coulomb constant for the all-pairs repulsion. */
  repulsion: 5000,
  /** Rest length and stiffness of a dependency link. */
  linkDistance: 48,
  linkStrength: 0.55,
  /** How hard a title is pulled towards the height of its depth. */
  depthStrength: 0.34,
  /** ...and how far it is allowed to stray from it regardless, as a fraction
   *  of `levelGap`. Under a half, consecutive bands cannot overlap, so every
   *  edge is guaranteed to point downward however hard the graph is dragged
   *  about. This is the constraint the whole layout rests on. */
  depthBand: 0.36,
  /** A weak pull towards the middle, so nothing drifts off to infinity. */
  centreStrength: 0.014,
  /** Fraction of velocity carried into the next tick. */
  friction: 0.58,
  /** Simulated annealing: motion scales with alpha, which decays to nothing. */
  alphaDecay: 0.016,
  alphaMin: 0.002,
  /** Minimum clear space between two node centres. */
  collideRadius: 26,
  /** Cap on the per-tick displacement, which is what stops the cloud exploding
   *  when two nodes start almost on top of each other. */
  maxSpeed: 24,
}

/**
 * Index the catalog and its edges into the shape the simulation wants.
 *
 * `depth` is the longest path from a title with no prerequisites, which is what
 * guarantees a title sits strictly below everything it depends on — the same
 * reasoning as the per-title graph, where shortest path would let edges skip
 * backwards over intervening layers.
 */
export function buildGraph(movies, edges) {
  const ids = movies.map((movie) => movie.id)
  const known = new Set(ids)

  const best = new Map()
  for (const edge of edges ?? []) {
    if (edge.from === edge.to) continue
    if (!known.has(edge.from) || !known.has(edge.to)) continue

    const key = `${edge.from}->${edge.to}`
    const existing = best.get(key)
    // A stray duplicate must never downgrade a prerequisite to a suggestion.
    if (!existing || (existing.strength !== 'essential' && edge.strength === 'essential')) {
      best.set(key, { ...edge, id: key, strength: edge.strength ?? 'essential' })
    }
  }

  const preds = new Map(ids.map((id) => [id, []]))
  const succs = new Map(ids.map((id) => [id, []]))
  for (const edge of best.values()) {
    preds.get(edge.to).push(edge.from)
    succs.get(edge.from).push(edge.to)
  }

  // Kahn's algorithm, ties broken by catalog position: a valid watch order that
  // follows the catalog wherever the edges allow it. Doubles as the reading
  // order the keyboard steps through, and as the guard against a cycle.
  const rank = new Map(ids.map((id, index) => [id, index]))
  const remaining = new Map(ids.map((id) => [id, preds.get(id).length]))
  const ready = ids.filter((id) => remaining.get(id) === 0)
  const order = []
  while (ready.length > 0) {
    ready.sort((a, b) => rank.get(a) - rank.get(b))
    const id = ready.shift()
    order.push(id)
    for (const next of succs.get(id)) {
      remaining.set(next, remaining.get(next) - 1)
      if (remaining.get(next) === 0) ready.push(next)
    }
  }
  if (order.length < ids.length) {
    const seen = new Set(order)
    order.push(...ids.filter((id) => !seen.has(id)))
  }

  const depth = new Map()
  for (const id of order) {
    let deepest = 0
    for (const predecessor of preds.get(id)) {
      deepest = Math.max(deepest, (depth.get(predecessor) ?? 0) + 1)
    }
    depth.set(id, deepest)
  }

  const byId = new Map(movies.map((movie) => [movie.id, movie]))
  const nodes = order.map((id) => ({
    ...byId.get(id),
    depth: depth.get(id),
    degree: preds.get(id).length + succs.get(id).length,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
  }))

  const index = new Map(nodes.map((node, position) => [node.id, position]))
  const links = [...best.values()].map((edge) => ({
    ...edge,
    source: index.get(edge.from),
    target: index.get(edge.to),
  }))

  return {
    nodes,
    links,
    order,
    preds,
    succs,
    maxDepth: Math.max(0, ...depth.values()),
  }
}

/**
 * Deterministic starting positions: banded by depth, then ordered within each
 * band to get the crossings down before the forces ever run.
 *
 * Seeded rather than random because a graph that lands somewhere different on
 * every reload is not a diagram of anything — and because starting near the
 * answer is most of what makes it settle quickly.
 */
export function seedPositions(graph, options = {}) {
  const { levelGap, collideRadius } = { ...DEFAULTS, ...options }
  const { nodes, preds, succs } = graph

  const bands = []
  for (const node of nodes) {
    if (!bands[node.depth]) bands[node.depth] = []
    bands[node.depth].push(node)
  }

  const spacing = collideRadius * 3
  const place = (band) =>
    band.forEach((node, index) => {
      node.x = (index - (band.length - 1) / 2) * spacing
      node.y = node.depth * levelGap
      node.vx = 0
      node.vy = 0
    })
  for (const band of bands) place(band ?? [])

  // Then order each band by where its neighbours already are — the median
  // heuristic from Sugiyama's method, which is worth running even though the
  // forces will move everything afterwards: a force layout barely reorders a
  // band, so it inherits however many crossings it starts with. Four sweeps
  // alternating direction gets most of what a dozen would.
  const by = new Map(nodes.map((node) => [node.id, node]))
  const barycentre = (node, side) => {
    const neighbours = side.get(node.id).map((id) => by.get(id).x)
    if (neighbours.length === 0) return node.x
    return neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
  }

  for (let sweep = 0; sweep < 4; sweep += 1) {
    const downward = sweep % 2 === 0
    const order = downward ? [...bands.keys()] : [...bands.keys()].reverse()
    for (const depth of order) {
      const band = bands[depth]
      if (!band || band.length < 2) continue
      const key = new Map(band.map((node) => [node.id, barycentre(node, downward ? preds : succs)]))
      band.sort((a, b) => key.get(a.id) - key.get(b.id))
      place(band)
    }
  }

  // A hair of asymmetry, so two titles in identical situations do not sit
  // exactly on top of each other with no force able to separate them.
  nodes.forEach((node, index) => {
    node.x += ((index % 7) - 3) * 0.5
  })

  return nodes
}

/**
 * One simulation, advanced a tick at a time.
 *
 * Repulsion is all-pairs and naive. At 123 titles that is 7,503 pairs a tick,
 * which costs less than the render it feeds — a quadtree here would be code
 * nobody needs to read.
 */
export function createSimulation(graph, options = {}) {
  const config = { ...DEFAULTS, ...options }
  const { nodes, links } = graph

  let alpha = 1
  const centre = 0

  function tick() {
    if (alpha <= config.alphaMin) return alpha
    alpha *= 1 - config.alphaDecay

    // --------------------------------------------------------- repulsion --
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let squared = dx * dx + dy * dy

        if (squared < 1) {
          // Coincident. Nudge them apart deterministically rather than
          // dividing by zero and launching both into the void.
          dx = (i % 3) - 1 || 1
          dy = (j % 3) - 1 || 1
          squared = dx * dx + dy * dy
        }

        const distance = Math.sqrt(squared)
        const push = (config.repulsion * alpha) / (squared * distance)
        a.vx -= dx * push
        a.vy -= dy * push
        b.vx += dx * push
        b.vy += dy * push
      }
    }

    // ------------------------------------------------------------- links --
    for (const link of links) {
      const a = nodes[link.source]
      const b = nodes[link.target]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
      const pull = ((distance - config.linkDistance) / distance) * config.linkStrength * alpha
      a.vx += dx * pull
      a.vy += dy * pull
      b.vx -= dx * pull
      b.vy -= dy * pull
    }

    // ------------------------------------------------- depth and centring --
    for (const node of nodes) {
      const wanted = node.depth * config.levelGap
      node.vy += (wanted - node.y) * config.depthStrength * alpha
      node.vx += (centre - node.x) * config.centreStrength * alpha
    }

    // ------------------------------------------------------- integration --
    const band = config.levelGap * config.depthBand
    for (const node of nodes) {
      if (node.fx !== null) {
        node.x = node.fx
        // Even a dragged title stays inside its band. Letting the pointer carry
        // one across another depth is the one move that would leave an edge
        // pointing back up the diagram, and the promise that reading downward
        // is a valid watch order is worth more than unrestricted dragging.
        node.y = clamp(node.fy, node.depth * config.levelGap, band)
        node.vx = 0
        node.vy = 0
        continue
      }

      const speed = Math.hypot(node.vx, node.vy)
      if (speed > config.maxSpeed) {
        node.vx = (node.vx / speed) * config.maxSpeed
        node.vy = (node.vy / speed) * config.maxSpeed
      }

      node.x += node.vx
      node.y = clamp(node.y + node.vy, node.depth * config.levelGap, band)
      node.vx *= config.friction
      node.vy *= config.friction
    }

    // --------------------------------------------------------- collision --
    // Straight on the positions, after everything else, because a repulsion
    // soft enough to look organic will still let two nodes overlap — and
    // overlapping labels are most of what makes a graph look like a mess.
    //
    // Twice, because the band clamp undoes the vertical half of any separation
    // it is given: the second pass finds what is left still overlapping and,
    // with the vertical route now closed, resolves it sideways.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distance = Math.hypot(dx, dy) || 0.01
          const overlap = config.collideRadius * 2 - distance
          if (overlap <= 0) continue

          const shift = (overlap / distance) * 0.5
          const mx = dx * shift
          const my = dy * shift
          if (a.fx === null) {
            a.x -= mx
            a.y = clamp(a.y - my, a.depth * config.levelGap, band)
          }
          if (b.fx === null) {
            b.x += mx
            b.y = clamp(b.y + my, b.depth * config.levelGap, band)
          }
        }
      }
    }

    return alpha
  }

  return {
    nodes,
    links,
    tick,
    get alpha() {
      return alpha
    },
    /** Warm it back up — after a drag, or a change of what is being drawn. */
    reheat(to = 0.5) {
      alpha = Math.max(alpha, to)
    },
    settle(ticks = 400) {
      for (let step = 0; step < ticks && alpha > config.alphaMin; step += 1) tick()
      return alpha
    },
  }
}

/** Held within `spread` of `centre`. */
function clamp(value, centre, spread) {
  return Math.min(Math.max(value, centre - spread), centre + spread)
}

/** The box the graph currently occupies, with room for the labels. */
export function boundsOf(nodes, margin = 80) {
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    if (node.x < minX) minX = node.x
    if (node.y < minY) minY = node.y
    if (node.x > maxX) maxX = node.x
    if (node.y > maxY) maxY = node.y
  }

  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  }
}
