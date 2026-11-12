import { useWatchProgress } from '../hooks/useWatchProgress'
import { isPlanned, isWatched, needsRewatch, setStatus } from '../lib/watchStorage'

/**
 * The statuses the check button cannot say: "I'm part way through this", "I want
 * to watch this" and "I've seen it and want to see it again".
 *
 * Each is a toggle on its own. Watching and want-to-watch are for a title that is
 * not finished, so they are unavailable once watched; rewatch implies watched, so choosing it marks
 * the title seen as well. Both sit alongside the check button rather than
 * replacing it, because that stays the one-tap answer for the common case.
 */
export function StatusPicker({ movieId, episodeCount = 0, className = '' }) {
  const progress = useWatchProgress()
  const watched = isWatched(progress, movieId)
  const watching = !watched && progress[movieId]?.status === 'watching'
  const planned = isPlanned(progress, movieId)
  const rewatch = needsRewatch(progress, movieId)

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="group" aria-label="Status">
      <button
        type="button"
        className="chip min-h-9 px-3"
        aria-pressed={watching}
        disabled={watched}
        title={watched ? 'Already watched' : undefined}
        onClick={() => setStatus(movieId, watching ? null : 'watching')}
      >
        Watching
      </button>
      <button
        type="button"
        className="chip min-h-9 px-3"
        aria-pressed={planned}
        disabled={watched}
        title={watched ? 'Already watched' : undefined}
        onClick={() => setStatus(movieId, planned ? null : 'planned')}
      >
        Want to watch
      </button>
      <button
        type="button"
        className="chip min-h-9 px-3"
        aria-pressed={rewatch}
        onClick={() => setStatus(movieId, rewatch ? 'watched' : 'rewatch', episodeCount)}
      >
        Need to rewatch
      </button>
    </div>
  )
}
