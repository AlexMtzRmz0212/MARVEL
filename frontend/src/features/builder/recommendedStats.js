import { isWatched, progressFor } from '../../lib/watchStorage'

/**
 * Where the viewer stands in a ready-made order: how much of it is behind
 * them, and the first title in it they have not seen -- which, in an order,
 * is the answer to "what do I put on tonight".
 */
export function orderStats(order, progress) {
  const stats = progressFor(progress, order.movie_ids)
  const nextUp = order.movie_ids.find((id) => !isWatched(progress, id)) ?? null
  return { ...stats, nextUp }
}

/** The builder's "start from this list" link, so a copy can be reworked and saved. */
export function makeItMineHref(order) {
  const params = new URLSearchParams({ start: order.movie_ids.join(','), name: order.name })
  return `/orders/new?${params}`
}
