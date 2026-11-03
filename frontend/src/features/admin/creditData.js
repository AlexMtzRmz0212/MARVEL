/**
 * Credit scenes, between the catalog's shape and the form's.
 *
 * The catalog distinguishes three things and the form has to as well:
 *
 *  - `null` / absent: nobody has checked. The site says nothing.
 *  - `{ count: 0 }`: somebody sat through the credits and there was nothing. The
 *    site says so.
 *  - a count, or for a series a list of the episodes that hold something back,
 *    whose total is their sum and so is never written down a second time.
 *
 * A pure module so the rules the schema enforces (episodes in broadcast order,
 * no `count` beside an episode list, nothing per-episode on a film) are
 * tested without a dialog.
 */

export const MAX_SCENES = 5

/** What the form holds while it is being edited: strings where an input is. */
export function toDraft(stored) {
  if (!stored) return null
  return {
    count: stored.count ?? 0,
    note: stored.note ?? '',
    episodes: (stored.episodes ?? []).map((entry) => ({
      episode: entry.episode,
      name: entry.name ?? '',
      count: entry.count ?? 1,
      note: entry.note ?? '',
    })),
  }
}

/** The state "Checked" starts from: one scene, which is the common case. */
export const CHECKED = { count: 1, note: '', episodes: [] }

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The catalog's shape for a draft, or `null` for "not checked".
 *
 * Quietly repairs what the schema would otherwise reject for reasons the form
 * has no field to explain: an episode list is put in broadcast order, an entry
 * with no usable episode number is dropped, and a list on something that is not
 * a series is folded into a plain total.
 */
export function cleanCredits(draft, isSeries) {
  if (!draft) return null

  const note = text(draft.note)
  const episodes = (draft.episodes ?? [])
    .map((entry) => ({ ...entry, episode: Number(entry.episode) }))
    .filter((entry) => Number.isInteger(entry.episode) && entry.episode >= 1)
    .sort((a, b) => a.episode - b.episode)
    .map((entry) => {
      const name = text(entry.name)
      const entryNote = text(entry.note)
      return {
        episode: entry.episode,
        ...(name && { name }),
        count: clamp(Number(entry.count) || 1, 1, MAX_SCENES),
        ...(entryNote && { note: entryNote }),
      }
    })

  if (isSeries && episodes.length) {
    return { episodes, ...(note && { note }) }
  }

  // Not a series, or a series with no list: a plain total. A list that is being
  // folded away still counts for something rather than silently becoming zero.
  const total = episodes.length
    ? episodes.reduce((sum, entry) => sum + entry.count, 0)
    : Number(draft.count) || 0
  return { count: clamp(total, 0, MAX_SCENES), ...(note && { note }) }
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, Math.trunc(value)))
}
