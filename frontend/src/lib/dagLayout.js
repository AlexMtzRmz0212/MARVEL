/**
 * Lay out a prerequisite graph as columns.
 *
 * The server already computed each node's `depth` by longest path, which is the
 * expensive part and the part that has to be right: longest path guarantees a
 * node sits strictly further from the target than everything depending on it,
 * so no edge ever points backwards. That leaves this file with pure arithmetic
 * — bucket by depth, order within each column, draw curves — which is why the
 * app needs no graph library at all.
 *
 * Deepest prerequisites sit on the left and the target on the right, so the
 * diagram reads left-to-right in watch order.
 */

export const DEFAULTS = {
  columnWidth: 240,
  rowHeight: 104,
  nodeWidth: 176,
  nodeHeight: 72,
  padding: 32,
}

/**
 * One pass of the Sugiyama median heuristic.
 *
 * Order each column by the average position of the nodes it points at, so
 * parents sit near their children and edges stop crossing unnecessarily.
 * Chronological order is the tie-break, which keeps the result stable and
 * meaningful when the heuristic has nothing to say.
 */
function orderWithinColumns(columns, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const targetsOf = new Map()
  for (const edge of edges) {
    if (!targetsOf.has(edge.from)) targetsOf.set(edge.from, [])
    targetsOf.get(edge.from).push(edge.to)
  }

  const depths = [...columns.keys()].sort((a, b) => a - b)
  const rank = new Map()

  // Walk from the target column outwards, so each column is placed relative to
  // one that already has positions.
  for (const depth of depths) {
    const column = columns.get(depth)
    column.sort((a, b) => (a.chrono_order ?? 0) - (b.chrono_order ?? 0))

    if (depth > 0) {
      const median = (node) => {
        const targets = (targetsOf.get(node.id) ?? [])
          .map((id) => rank.get(id))
          .filter((value) => value !== undefined)
        if (targets.length === 0) return Number.POSITIVE_INFINITY
        return targets.reduce((sum, value) => sum + value, 0) / targets.length
      }
      column.sort((a, b) => {
        const difference = median(a) - median(b)
        if (difference !== 0 && Number.isFinite(difference)) return difference
        return (a.chrono_order ?? 0) - (b.chrono_order ?? 0)
      })
    }

    column.forEach((node, index) => rank.set(node.id, index - (column.length - 1) / 2))
  }

  return byId
}

export function layoutDag(nodes, edges, options = {}) {
  const { columnWidth, rowHeight, nodeWidth, nodeHeight, padding } = { ...DEFAULTS, ...options }

  if (!nodes || nodes.length === 0) {
    return { nodes: [], paths: [], width: 0, height: 0, nodeWidth, nodeHeight }
  }

  const maxDepth = Math.max(...nodes.map((node) => node.depth))

  const columns = new Map()
  for (const node of nodes) {
    if (!columns.has(node.depth)) columns.set(node.depth, [])
    columns.get(node.depth).push(node)
  }

  orderWithinColumns(columns, nodes, edges)

  const positioned = new Map()
  for (const [depth, column] of columns) {
    column.forEach((node, index) => {
      positioned.set(node.id, {
        ...node,
        // depth 0 is the target, which belongs on the right.
        x: (maxDepth - depth) * columnWidth,
        y: (index - (column.length - 1) / 2) * rowHeight,
      })
    })
  }

  // Shift everything positive so the SVG viewBox can start at the origin.
  const minY = Math.min(...[...positioned.values()].map((node) => node.y))
  const maxY = Math.max(...[...positioned.values()].map((node) => node.y))
  const offsetY = padding - minY

  for (const node of positioned.values()) {
    node.x += padding
    node.y += offsetY
  }

  const paths = edges
    .map((edge) => {
      const from = positioned.get(edge.from)
      const to = positioned.get(edge.to)
      if (!from || !to) return null

      const x1 = from.x + nodeWidth
      const y1 = from.y + nodeHeight / 2
      const x2 = to.x
      const y2 = to.y + nodeHeight / 2
      const midpoint = (x1 + x2) / 2

      return {
        ...edge,
        id: `${edge.from}->${edge.to}`,
        d: `M${x1},${y1} C${midpoint},${y1} ${midpoint},${y2} ${x2},${y2}`,
      }
    })
    .filter(Boolean)

  return {
    nodes: [...positioned.values()],
    paths,
    width: (maxDepth + 1) * columnWidth + padding * 2 - (columnWidth - nodeWidth),
    height: maxY - minY + nodeHeight + padding * 2,
    nodeWidth,
    nodeHeight,
    maxDepth,
  }
}
