/**
 * The arithmetic behind the quick-sort deck, kept free of React so it can be
 * tested without a pointer in sight.
 *
 * Three directions mean something -- right, left and down -- and up does not:
 * flicking a card up is what a thumb does by accident on the way to scrolling,
 * so it snaps back rather than recording a verdict nobody meant.
 */

/** What each direction records. Values are `watchStorage.setStatus` verdicts. */
export const VERDICT = {
  right: 'watched',
  left: 'unseen',
  down: 'unsure',
}

/** The stamp printed on the card as it travels, and the key that does the same. */
export const DIRECTIONS = {
  right: { stamp: 'Seen!', label: 'Seen it', key: 'ArrowRight' },
  left: { stamp: 'Nope', label: 'Not seen', key: 'ArrowLeft' },
  down: { stamp: 'Hmm?', label: "Don't recall", key: 'ArrowDown' },
}

/** A drag must travel this far, as a share of the card, to count on its own. */
const DISTANCE_SHARE = { x: 0.3, y: 0.22 }
/** ...but never less than this many pixels, so a tiny card is not hair-trigger. */
const MIN_DISTANCE = 72
/** A flick this fast (px per ms) counts even when it is short... */
const FLICK_SPEED = 0.6
/** ...as long as it travelled at least this far, which rules out a tap. */
const FLICK_DISTANCE = 28

function thresholds(width, height) {
  return {
    x: Math.max(MIN_DISTANCE, width * DISTANCE_SHARE.x),
    y: Math.max(MIN_DISTANCE, height * DISTANCE_SHARE.y),
  }
}

/** The direction a drag is heading, judged by its dominant axis. */
function heading(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx === 0) return null
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'down' : null
}

/**
 * Where an in-flight drag is pointing and how close it is to committing, 0..1.
 * Drives the stamp's opacity, so the user can see a verdict coming and back
 * out of it.
 */
export function swipeIntent(dx, dy, width, height) {
  const direction = heading(dx, dy)
  if (!direction) return { direction: null, strength: 0 }
  const limit = thresholds(width, height)
  const travelled = direction === 'down' ? dy / limit.y : Math.abs(dx) / limit.x
  return { direction, strength: Math.min(1, Math.max(0, travelled)) }
}

/**
 * The direction a finished drag commits to, or null to snap back.
 *
 * `vx`/`vy` are release velocities in px/ms. A slow drag has to cross the
 * distance threshold; a fast flick in the same direction only has to leave the
 * dead zone.
 */
export function decideSwipe({ dx, dy, vx = 0, vy = 0, width, height }) {
  const direction = heading(dx, dy)
  if (!direction) return null

  const limit = thresholds(width, height)
  if (direction === 'down') {
    if (dy >= limit.y) return direction
    return vy >= FLICK_SPEED && dy >= FLICK_DISTANCE ? direction : null
  }

  const distance = Math.abs(dx)
  if (distance >= limit.x) return direction
  const speed = direction === 'right' ? vx : -vx
  return speed >= FLICK_SPEED && distance >= FLICK_DISTANCE ? direction : null
}

/**
 * The titles a session will deal, in order. Computed once when a session
 * starts -- not live -- so that re-sorting a "don't recall" as "don't recall"
 * moves on instead of dealing the same card forever.
 */
export function buildQueue(movies, progress, { mode, kind, phase }, statusOf) {
  return movies
    .filter((movie) => {
      const status = statusOf(progress, movie.id)
      if (mode === 'revisit' ? status !== 'unsure' : status !== null) return false
      if (kind !== 'all' && movie.media_type !== kind) return false
      if (phase && movie.phase !== phase) return false
      return true
    })
    .map((movie) => movie.id)
}
