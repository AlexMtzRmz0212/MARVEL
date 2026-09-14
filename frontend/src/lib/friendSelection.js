/**
 * Which friends the compare page is holding, as carried in the URL.
 *
 * In the query string rather than in component state, so a comparison is a place
 * rather than a mood: it survives a refresh, it can be sent to somebody, and the
 * back button walks out of it. `?with=` already worked that way for share links
 * and this is the same idea for several people at once.
 *
 * Pure and dependency-free, which is why it is here rather than inline in the
 * page. The cap and the dedupe are the only two rules and both are worth a test.
 */

/**
 * The most friends that can be compared at once, and not an arbitrary number.
 *
 * Each person adds a column of marks to every one of the catalogue's rows. Five
 * columns (you plus four) is what still fits beside a truncated title at 360px
 * without the row becoming a wall of dots nobody can trace across. Past that the
 * comparison stops answering "what should we watch" and starts needing a
 * spreadsheet.
 */
export const MAX_COMPARE_FRIENDS = 4

/**
 * The ids from a `?friends=` value.
 *
 * Deduped, capped, and otherwise untouched: whether an id names a real friend is
 * the server's answer, not this module's, and a stale id in a bookmarked link
 * should simply drop out of the comparison rather than break the page.
 */
export function parseFriendIds(value) {
  if (!value) return []
  const unique = [...new Set(value.split(',').filter(Boolean))]
  return unique.slice(0, MAX_COMPARE_FRIENDS)
}

export function friendIdsParam(ids) {
  return ids.join(',')
}

/**
 * Add or remove one id, refusing to grow past the cap.
 *
 * Returns the list unchanged when a fifth friend is asked for, so the caller can
 * compare by identity to know nothing happened. Removing always works, which is
 * what keeps the cap from being a trap.
 */
export function toggleFriendId(ids, id) {
  if (ids.includes(id)) return ids.filter((existing) => existing !== id)
  if (ids.length >= MAX_COMPARE_FRIENDS) return ids
  return [...ids, id]
}
