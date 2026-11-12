/**
 * Where the header's search lens sends you.
 *
 * Everywhere in the app a match means "open that title", so the lens
 * navigates. On the timeline the title is already on screen — it is one of the
 * bubbles — and leaving the graph to look at a page about the thing you were
 * pointing at is the wrong answer to "where is X".
 *
 * So a page can claim the lens while it is mounted and answer the question
 * itself. Claiming it also puts the lens on Ctrl-F. Every key is optional:
 *
 *   find(movie)  — show it here; returns whether it did. Anything a page
 *                  cannot show (a title missing from its graph, say) falls
 *                  back to `onPick`, then to navigating, so the lens is never
 *                  a dead end.
 *   onPick(movie) — answer a pick some other way than navigating: open a
 *                  panel, put it on top of a deck.
 *   renderPicked(movie, { close }) — keep the bubble open after a pick and show
 *                  this in it, instead of calling `onPick`.
 *   origin()     — the element the bubble flies out of: the page's own search
 *                  field, if it has one. Falls back to the header lens.
 *   onQuery(text) / initialQuery() — mirror what is typed into the page, for a
 *                  page whose own search field the bubble stands in for.
 *   refocus()    — put the keyboard back where the page wants it, which is how
 *                  Escape hands control back to the page rather than dropping
 *                  focus on the floor.
 *
 * `useSearchClaim` is the way to make a claim from a component.
 *
 * Same external-store shape as `syncStatus` and the storage modules, so the
 * lens subscribes with `useSyncExternalStore` like everything else. Only one
 * page is ever mounted at a time, so a single slot is enough — but a release
 * only clears the slot if it is still holding its own claim, which is what
 * keeps a slow unmount from wiping the next page's claim.
 */

let handler = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return handler
}

/** Take the lens. Returns the release, so an effect can just return it. */
export function claimSearch(next) {
  handler = next
  notify()
  return () => {
    if (handler !== next) return
    handler = null
    notify()
  }
}
