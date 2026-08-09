/**
 * A direct port of `backend/app/core/graph.py`.
 *
 * It exists so that dragging a title produces feedback in the same frame
 * instead of after a round trip. The server stays the authority — the builder
 * revalidates against `POST /orders/validate` on save — but a per-drop request
 * would make the interaction feel broken.
 *
 * Two implementations of one rule is a real risk, and it is managed rather than
 * ignored: this file is a close translation, it returns the same snake_case
 * shape as the Python dataclasses, and both sides are tested against the same
 * `fixtures/validation_cases.json`. If they ever diverge, that fixture fails on
 * one side. Keep the two in step when changing either.
 */

/**
 * Key for an edge in the lookup maps.
 *
 * `->` is safe as a separator because slugs match `^[a-z0-9]+(-[a-z0-9]+)*$`
 * and so can never contain `>`; that rules out two different edges colliding on
 * one key.
 */
const edgeKey = (prerequisiteId, movieId) => `${prerequisiteId}->${movieId}`

/** Convert the API's `/graph/edges` shape into the internal one. */
export function edgesFromApi(apiEdges) {
  return apiEdges.map((edge) => ({
    movie_id: edge.to,
    prerequisite_id: edge.from,
    strength: edge.strength ?? 'essential',
    note: edge.note ?? null,
  }))
}

/**
 * Index an edge set. Mirrors `Graph.build`.
 *
 * Parallel edges collapse, and when duplicates disagree on strength the
 * stronger wins, so a stray duplicate can never silently downgrade a
 * prerequisite from required to optional.
 */
export function createGraph(nodes, edges) {
  const nodeKeys = nodes instanceof Map ? new Map(nodes) : new Map(Object.entries(nodes))

  const best = new Map()
  for (const edge of edges) {
    if (edge.movie_id === edge.prerequisite_id) continue
    if (!nodeKeys.has(edge.movie_id) || !nodeKeys.has(edge.prerequisite_id)) continue

    const pair = edgeKey(edge.prerequisite_id, edge.movie_id)
    const existing = best.get(pair)
    if (!existing || (existing.strength !== 'essential' && edge.strength === 'essential')) {
      best.set(pair, edge)
    }
  }

  const successors = new Map()
  const predecessors = new Map()
  for (const id of nodeKeys.keys()) {
    successors.set(id, [])
    predecessors.set(id, [])
  }
  const strengths = new Map()

  for (const edge of best.values()) {
    successors.get(edge.prerequisite_id).push(edge.movie_id)
    predecessors.get(edge.movie_id).push(edge.prerequisite_id)
    strengths.set(edgeKey(edge.prerequisite_id, edge.movie_id), edge.strength)
  }
  for (const list of successors.values()) list.sort()
  for (const list of predecessors.values()) list.sort()

  const sortedEdges = [...best.values()].sort(
    (a, b) =>
      a.prerequisite_id.localeCompare(b.prerequisite_id) ||
      a.movie_id.localeCompare(b.movie_id),
  )

  return {
    nodes: nodeKeys,
    edges: sortedEdges,
    successors,
    predecessors,
    strengths,
    has: (id) => nodeKeys.has(id),
    sortKey: (id) => nodeKeys.get(id),
    strengthOf: (prerequisiteId, movieId) => strengths.get(edgeKey(prerequisiteId, movieId)),
  }
}

/** Lexicographic comparison of composite sort keys, then id, for a total order. */
function compareKeys(a, b) {
  const left = Array.isArray(a.key) ? a.key : [a.key]
  const right = Array.isArray(b.key) ? b.key : [b.key]
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i] ?? 0
    const y = right[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export class CycleError extends Error {}

/**
 * Kahn's algorithm with a deterministic tie-break.
 *
 * A linear scan for the minimum rather than a heap: at a few dozen nodes the
 * difference is unmeasurable, and this is far easier to verify against the
 * Python original.
 */
export function topologicalSort(graph, keyFn) {
  const key = keyFn ?? ((id) => graph.sortKey(id))
  const indegree = new Map()
  for (const id of graph.nodes.keys()) indegree.set(id, graph.predecessors.get(id).length)

  const available = []
  for (const [id, degree] of indegree) if (degree === 0) available.push({ id, key: key(id) })

  const order = []
  while (available.length > 0) {
    let pick = 0
    for (let i = 1; i < available.length; i += 1) {
      if (compareKeys(available[i], available[pick]) < 0) pick = i
    }
    const { id } = available.splice(pick, 1)[0]
    order.push(id)

    for (const dependent of graph.successors.get(id)) {
      const remaining = indegree.get(dependent) - 1
      indegree.set(dependent, remaining)
      if (remaining === 0) available.push({ id: dependent, key: key(dependent) })
    }
  }

  if (order.length !== graph.nodes.size) {
    throw new CycleError('The catalog contains a prerequisite cycle.')
  }
  return order
}

/** The graph induced on a set of ids. */
export function subgraph(graph, ids) {
  const keep = new Set([...ids].filter((id) => graph.has(id)))
  const nodes = new Map()
  for (const id of keep) nodes.set(id, graph.sortKey(id))
  const edges = graph.edges.filter(
    (edge) => keep.has(edge.movie_id) && keep.has(edge.prerequisite_id),
  )
  return createGraph(nodes, edges)
}

/** Every title reachable backwards from `target`. The visited set is the memo. */
export function ancestors(graph, target) {
  const seen = new Set()
  const stack = [target]
  while (stack.length > 0) {
    for (const prerequisite of graph.predecessors.get(stack.pop()) ?? []) {
      if (!seen.has(prerequisite)) {
        seen.add(prerequisite)
        stack.push(prerequisite)
      }
    }
  }
  return seen
}

/**
 * Check an order against the DAG. One O(E) pass over the direct edges.
 *
 * Only direct edges are reported: checking the transitive closure would turn a
 * single misplaced title into dozens of redundant messages.
 */
export function validateOrder(graph, order) {
  const seen = new Set()
  const duplicate_ids = []
  const unknown_ids = []
  const cleaned = []

  for (const id of order) {
    if (seen.has(id)) {
      duplicate_ids.push(id)
      continue
    }
    seen.add(id)
    if (!graph.has(id)) {
      unknown_ids.push(id)
      continue
    }
    cleaned.push(id)
  }

  const position = new Map(cleaned.map((id, index) => [id, index]))
  const violations = []
  const missing = new Set()

  for (const edge of graph.edges) {
    if (!position.has(edge.movie_id)) continue
    const severity = edge.strength === 'essential' ? 'error' : 'warning'

    if (!position.has(edge.prerequisite_id)) {
      missing.add(edge.prerequisite_id)
      violations.push({
        kind: 'missing_prerequisite',
        severity,
        movie_id: edge.movie_id,
        prerequisite_id: edge.prerequisite_id,
        strength: edge.strength,
        movie_position: position.get(edge.movie_id),
        prerequisite_position: null,
      })
    } else if (position.get(edge.prerequisite_id) > position.get(edge.movie_id)) {
      violations.push({
        kind: 'out_of_order',
        severity,
        movie_id: edge.movie_id,
        prerequisite_id: edge.prerequisite_id,
        strength: edge.strength,
        movie_position: position.get(edge.movie_id),
        prerequisite_position: position.get(edge.prerequisite_id),
      })
    }
  }

  violations.sort(
    (a, b) =>
      (a.movie_position ?? 0) - (b.movie_position ?? 0) ||
      a.prerequisite_id.localeCompare(b.prerequisite_id),
  )

  return {
    is_valid: !violations.some((violation) => violation.severity === 'error'),
    has_warnings: violations.some((violation) => violation.severity === 'warning'),
    checked_count: cleaned.length,
    violations,
    missing_prerequisite_ids: [...missing].sort(),
    suggested_order: repairOrder(graph, cleaned),
    unknown_ids,
    duplicate_ids,
  }
}

/**
 * The minimal-surprise fix: the same titles, reordered as little as possible.
 *
 * Tie-breaking by the user's own position yields the lexicographically smallest
 * valid order relative to where they put things. It reorders but never adds.
 */
export function repairOrder(graph, order) {
  const known = [...new Set(order)].filter((id) => graph.has(id))
  const position = new Map(known.map((id, index) => [id, index]))
  return topologicalSort(subgraph(graph, known), (id) => position.get(id))
}

/**
 * Add every missing prerequisite and return a valid order.
 *
 * Chosen titles keep their relative order wherever the DAG allows; injected
 * prerequisites are pulled in only when the order would otherwise be blocked,
 * which lands them directly before whatever needed them.
 */
export function completeOrder(graph, order) {
  const known = [...new Set(order)].filter((id) => graph.has(id))
  const position = new Map(known.map((id, index) => [id, index]))

  const required = new Set(known)
  for (const id of known) for (const ancestor of ancestors(graph, id)) required.add(ancestor)

  return topologicalSort(subgraph(graph, required), (id) =>
    position.has(id) ? [0, position.get(id)] : [1, graph.sortKey(id)],
  )
}

/**
 * Render a violation as a sentence.
 *
 * Word for word identical to `format_violation` in Python, so a live drag and a
 * server response never phrase the same problem differently. Positions are
 * 0-based in the data and 1-based in the prose.
 */
export function formatViolation(violation, titles) {
  const movie = titles[violation.movie_id] ?? violation.movie_id
  const prerequisite = titles[violation.prerequisite_id] ?? violation.prerequisite_id

  if (violation.kind === 'missing_prerequisite') {
    const verb = violation.strength === 'essential' ? 'is required' : 'is recommended'
    return `${prerequisite} ${verb} before ${movie} but isn't in this order.`
  }

  const moviePosition = (violation.movie_position ?? 0) + 1
  const prerequisitePosition = (violation.prerequisite_position ?? 0) + 1
  return `You have ${movie} (position ${moviePosition}) before ${prerequisite} (position ${prerequisitePosition}).`
}
