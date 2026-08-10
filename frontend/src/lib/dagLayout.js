/**
 * Lay out a prerequisite graph as columns.
 *
 * The server already computed each node's `depth` by longest path, which is the
 * expensive part and the part that has to be right: longest path guarantees a
 * node sits strictly further from the target than everything depending on it,
 * so no edge ever points backwards. That leaves this file with the readability
 * work — order each column, route the edges, place the rows — which is why the
 * app needs no graph library at all.
 *
 * Deepest prerequisites sit on the left and the target on the right, so the
 * diagram reads left-to-right in watch order.
 *
 * The layout is a small Sugiyama pipeline:
 *
 *   1. every edge that skips columns gets a *lane* in each column it crosses,
 *      so the graph becomes proper (all edges join neighbouring columns) and a
 *      long edge travels in its own reserved channel instead of cutting across
 *      whatever nodes happen to be in the way;
 *   2. columns are ordered by repeated median sweeps plus adjacent swaps, both
 *      scored by actual edge crossings, keeping the best ordering seen;
 *   3. rows are placed by pulling each node towards its neighbours and then
 *      pushing apart anything that collided, which straightens long runs;
 *   4. edges leave and enter nodes through fanned-out *ports* so several edges
 *      meeting at one node stay distinguishable instead of merging into a point.
 */

export const DEFAULTS = {
  columnWidth: 240,
  rowHeight: 104,
  nodeWidth: 176,
  nodeHeight: 72,
  padding: 32,
  /** Vertical channel reserved for one edge routed through a column. */
  laneHeight: 10,
  /** Median/transpose sweeps. Crossings stop improving well before this. */
  sweeps: 8,
}

const LANE_GAP = 6
const NODE_LANE_GAP = 20
/** How far past the node band a lane runs before it starts turning. */
const LANE_OVERHANG = 12

/** Minimum clear space between two stacked slots in the same column. */
function gapBetween(a, b, rowHeight, nodeHeight) {
  if (a.kind === 'lane' && b.kind === 'lane') return LANE_GAP
  if (a.kind === 'lane' || b.kind === 'lane') return NODE_LANE_GAP
  return rowHeight - nodeHeight
}

function pushInto(map, key, value) {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

function indexColumns(columns) {
  const position = new Map()
  for (const column of columns) column.forEach((slot, index) => position.set(slot.id, index))
  return position
}

/**
 * Crossings between two neighbouring columns.
 *
 * Every edge is a pair of row indices; two edges cross exactly when one pair is
 * ordered and the other is not, so this counts inversions. The columns hold a
 * handful of slots each, so the quadratic count is cheaper than being clever.
 */
function crossingsBetween(left, successors, position) {
  const pairs = []
  for (const slot of left) {
    for (const target of successors.get(slot.id) ?? []) {
      const to = position.get(target)
      if (to !== undefined) pairs.push([position.get(slot.id), to])
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  let crossings = 0
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      if (pairs[i][1] > pairs[j][1]) crossings += 1
    }
  }
  return crossings
}

function totalCrossings(columns, successors) {
  const position = indexColumns(columns)
  let total = 0
  for (let column = 0; column < columns.length - 1; column += 1) {
    total += crossingsBetween(columns[column], successors, position)
  }
  return total
}

function neighbourCrossings(columns, index, successors, position) {
  let total = 0
  if (index > 0) total += crossingsBetween(columns[index - 1], successors, position)
  if (index < columns.length - 1) total += crossingsBetween(columns[index], successors, position)
  return total
}

/** Median row of a slot's neighbours, or -1 when it has none to follow. */
function medianOf(slot, neighbours, position) {
  const rows = (neighbours.get(slot.id) ?? [])
    .map((id) => position.get(id))
    .filter((row) => row !== undefined)
    .sort((a, b) => a - b)

  if (rows.length === 0) return -1
  const middle = rows.length >> 1
  return rows.length % 2 === 1 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2
}

/**
 * Swap adjacent slots whenever it removes a crossing.
 *
 * The median heuristic gets the broad shape right but leaves local tangles it
 * cannot see, and those are the ones that read as noise.
 */
function transpose(columns, successors) {
  for (let round = 0; round < 6; round += 1) {
    let improved = false
    const position = indexColumns(columns)

    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index]
      for (let row = 0; row < column.length - 1; row += 1) {
        const before = neighbourCrossings(columns, index, successors, position)

        const [a, b] = [column[row], column[row + 1]]
        column[row] = b
        column[row + 1] = a
        position.set(a.id, row + 1)
        position.set(b.id, row)

        if (neighbourCrossings(columns, index, successors, position) < before) {
          improved = true
        } else {
          column[row] = a
          column[row + 1] = b
          position.set(a.id, row)
          position.set(b.id, row + 1)
        }
      }
    }

    if (!improved) return
  }
}

function orderColumns(columns, predecessors, successors, sweeps) {
  for (const column of columns) {
    column.sort((a, b) => a.chrono - b.chrono || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  let best = columns.map((column) => [...column])
  let bestScore = totalCrossings(columns, successors)

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const forwards = sweep % 2 === 0
    const neighbours = forwards ? predecessors : successors
    const position = indexColumns(columns)

    const order = [...columns.keys()]
    for (const index of forwards ? order.slice(1) : order.slice(0, -1).reverse()) {
      const keys = new Map()
      columns[index].forEach((slot, row) => {
        const median = medianOf(slot, neighbours, position)
        // A slot with nothing to follow keeps its current row rather than
        // collapsing to the top of the column.
        keys.set(slot.id, median < 0 ? row : median)
      })
      columns[index] = columns[index]
        .map((slot, row) => ({ slot, row }))
        .sort((a, b) => keys.get(a.slot.id) - keys.get(b.slot.id) || a.row - b.row)
        .map((entry) => entry.slot)
      columns[index].forEach((slot, row) => position.set(slot.id, row))
    }

    transpose(columns, successors)

    const score = totalCrossings(columns, successors)
    if (score < bestScore) {
      bestScore = score
      best = columns.map((column) => [...column])
    }
  }

  return best
}

/** Stack a column top to bottom, honouring each slot's height. */
function stackColumn(column, rowHeight, nodeHeight) {
  let cursor = 0
  column.forEach((slot, row) => {
    if (row > 0) cursor += gapBetween(column[row - 1], slot, rowHeight, nodeHeight)
    slot.y = cursor + slot.size / 2
    cursor += slot.size
  })
  // Centre the column on the shared axis. Stacking every column from the same
  // top edge would start a busy column and a one-node column at the same
  // height, and the alignment pass below has no anchor to undo that with — it
  // just carries the wedge through, leaving the diagram slumped to one corner.
  const shift = cursor / 2
  for (const slot of column) slot.y -= shift
}

/**
 * Move each slot to the average height of everything it connects to, then undo
 * any overlap that caused. Repeated, this pulls long chains into straight
 * horizontal runs, which is most of what makes a diagram followable.
 *
 * Each slot is pulled by both sides at once, deliberately. Averaging only the
 * side a sweep happens to come from anchors the far column and lets the rest
 * drift away from it, which builds a diagonal slump across the diagram and
 * strands the corners empty. Pulling from both sides is a relaxation that
 * settles instead of drifting; the sweep direction only affects how fast.
 */
function alignRows(columns, predecessors, successors, rowHeight, nodeHeight) {
  const centreOf = new Map()
  for (const column of columns) for (const slot of column) centreOf.set(slot.id, slot.y)

  const neighboursOf = (id) => [...(predecessors.get(id) ?? []), ...(successors.get(id) ?? [])]

  for (let pass = 0; pass < 12; pass += 1) {
    const forwards = pass % 2 === 0

    const order = [...columns.keys()]
    for (const index of forwards ? order : [...order].reverse()) {
      const column = columns[index]

      const desired = new Map()
      for (const slot of column) {
        const heights = neighboursOf(slot.id)
          .map((id) => centreOf.get(id))
          .filter((value) => value !== undefined)
        slot.y = heights.length
          ? heights.reduce((sum, value) => sum + value, 0) / heights.length
          : slot.y
        desired.set(slot.id, slot.y)
      }

      // Push down anything that now overlaps, then pull the block back up into
      // whatever slack is left below it.
      for (let row = 1; row < column.length; row += 1) {
        const above = column[row - 1]
        const slot = column[row]
        const minimum =
          above.y + above.size / 2 + gapBetween(above, slot, rowHeight, nodeHeight) + slot.size / 2
        if (slot.y < minimum) slot.y = minimum
      }
      for (let row = column.length - 2; row >= 0; row -= 1) {
        const slot = column[row]
        const below = column[row + 1]
        const maximum =
          below.y - below.size / 2 - gapBetween(slot, below, rowHeight, nodeHeight) - slot.size / 2
        if (slot.y > maximum) slot.y = maximum
      }

      // Resolving overlaps always spends its first move pushing down, so a
      // crowded column creeps away from where its edges wanted it. Slide the
      // whole column back by the average error: separations are untouched, the
      // drift is not.
      const drift =
        column.reduce((sum, slot) => sum + (slot.y - desired.get(slot.id)), 0) / column.length
      for (const slot of column) slot.y -= drift

      for (const slot of column) centreOf.set(slot.id, slot.y)
    }
  }
}

/**
 * Spread the edges meeting at one node across its side, ordered by where they
 * come from, so a node with five prerequisites shows five distinct arrivals.
 */
function assignPorts(attachments, nodeHeight) {
  const ports = new Map()
  for (const [nodeId, list] of attachments) {
    list.sort((a, b) => a.towards - b.towards || (a.id < b.id ? -1 : 1))
    const span = Math.min(nodeHeight - 24, (list.length - 1) * 14)
    list.forEach((entry, index) => {
      const offset =
        list.length === 1 ? 0 : (index - (list.length - 1) / 2) * (span / (list.length - 1))
      ports.set(`${nodeId}|${entry.id}`, offset)
    })
  }
  return ports
}

function curveThrough(points) {
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    const midpoint = (x1 + x2) / 2
    // Horizontal tangents at both ends, so consecutive segments meet smoothly.
    d += ` C${midpoint},${y1} ${midpoint},${y2} ${x2},${y2}`
  }
  return d
}

export function layoutDag(nodes, edges, options = {}) {
  const { columnWidth, rowHeight, nodeWidth, nodeHeight, padding, laneHeight, sweeps } = {
    ...DEFAULTS,
    ...options,
  }

  if (!nodes || nodes.length === 0) {
    return { nodes: [], paths: [], width: 0, height: 0, nodeWidth, nodeHeight }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const maxDepth = Math.max(...nodes.map((node) => node.depth))
  // depth 0 is the target, which belongs on the right.
  const columnOf = (node) => maxDepth - node.depth

  const columns = Array.from({ length: maxDepth + 1 }, () => [])
  for (const node of nodes) {
    columns[columnOf(node)].push({
      id: node.id,
      kind: 'node',
      size: nodeHeight,
      chrono: node.chrono_order ?? 0,
      node,
    })
  }

  // ------------------------------------------------------------- routing --
  const live = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to))
  const lanesOf = new Map()

  for (const edge of live) {
    const id = `${edge.from}->${edge.to}`
    const start = columnOf(byId.get(edge.from))
    const end = columnOf(byId.get(edge.to))
    const lanes = []

    for (let column = start + 1; column < end; column += 1) {
      const lane = {
        id: `~${id}@${column}`,
        kind: 'lane',
        size: laneHeight,
        chrono: byId.get(edge.from).chrono_order ?? 0,
        column,
        edgeId: id,
      }
      columns[column].push(lane)
      lanes.push(lane)
    }
    lanesOf.set(id, lanes)
  }

  const predecessors = new Map()
  const successors = new Map()
  for (const edge of live) {
    const id = `${edge.from}->${edge.to}`
    if (columnOf(byId.get(edge.to)) <= columnOf(byId.get(edge.from))) continue
    const chain = [edge.from, ...lanesOf.get(id).map((lane) => lane.id), edge.to]
    for (let i = 0; i < chain.length - 1; i += 1) {
      pushInto(successors, chain[i], chain[i + 1])
      pushInto(predecessors, chain[i + 1], chain[i])
    }
  }

  // ------------------------------------------------------------ ordering --
  const ordered = orderColumns(columns, predecessors, successors, sweeps)
  for (const column of ordered) stackColumn(column, rowHeight, nodeHeight)
  alignRows(ordered, predecessors, successors, rowHeight, nodeHeight)

  // --------------------------------------------------------- coordinates --
  const columnX = (index) => padding + index * columnWidth
  // A lane crosses its whole column at a fixed height and only changes height
  // in the gutters, so a long edge never cuts through the node band it passes.
  const laneEntryX = (index) => columnX(index) - LANE_OVERHANG
  const laneExitX = (index) => columnX(index) + nodeWidth + LANE_OVERHANG

  const slots = ordered.flat()
  const minY = Math.min(...slots.map((slot) => slot.y - slot.size / 2))
  const offsetY = padding - minY
  for (const slot of slots) slot.y += offsetY

  const positioned = new Map()
  ordered.forEach((column, index) => {
    for (const slot of column) {
      if (slot.kind !== 'node') continue
      positioned.set(slot.id, { ...slot.node, x: columnX(index), y: slot.y - nodeHeight / 2 })
    }
  })
  const laneById = new Map(slots.filter((slot) => slot.kind === 'lane').map((l) => [l.id, l]))
  const centreOf = new Map(slots.map((slot) => [slot.id, slot.y]))

  // ------------------------------------------------------------- drawing --
  const outgoing = new Map()
  const incoming = new Map()
  for (const edge of live) {
    const id = `${edge.from}->${edge.to}`
    const lanes = lanesOf.get(id) ?? []
    const first = lanes.length ? lanes[0].id : edge.to
    const last = lanes.length ? lanes[lanes.length - 1].id : edge.from
    pushInto(outgoing, edge.from, { id, towards: centreOf.get(first) ?? 0 })
    pushInto(incoming, edge.to, { id, towards: centreOf.get(last) ?? 0 })
  }
  const exitPorts = assignPorts(outgoing, nodeHeight)
  const entryPorts = assignPorts(incoming, nodeHeight)

  const paths = live
    .map((edge) => {
      const from = positioned.get(edge.from)
      const to = positioned.get(edge.to)
      if (!from || !to) return null

      const id = `${edge.from}->${edge.to}`
      const lanes = lanesOf.get(id) ?? []
      const points = [
        [from.x + nodeWidth, from.y + nodeHeight / 2 + (exitPorts.get(`${edge.from}|${id}`) ?? 0)],
        ...lanes.flatMap((lane) => {
          const y = laneById.get(lane.id).y
          return [
            [laneEntryX(lane.column), y],
            [laneExitX(lane.column), y],
          ]
        }),
        [to.x, to.y + nodeHeight / 2 + (entryPorts.get(`${edge.to}|${id}`) ?? 0)],
      ]

      const middle = points[Math.floor((points.length - 1) / 2)]
      const next = points[Math.floor((points.length - 1) / 2) + 1] ?? middle

      return {
        ...edge,
        id,
        d: curveThrough(points),
        // Anchor for a label or tooltip when there is no pointer to follow.
        labelX: (middle[0] + next[0]) / 2,
        labelY: (middle[1] + next[1]) / 2,
      }
    })
    .filter(Boolean)

  const maxY = Math.max(...slots.map((slot) => slot.y + slot.size / 2))

  return {
    nodes: [...positioned.values()],
    paths,
    width: maxDepth * columnWidth + nodeWidth + padding * 2,
    height: maxY + padding,
    nodeWidth,
    nodeHeight,
    maxDepth,
  }
}
