import { toggleWatched } from '../lib/watchStorage'

/**
 * Mark a title watched.
 *
 * Used on top of poster art, so it carries its own scrim rather than relying on
 * whatever is behind it. Stops propagation because it sits inside a link.
 */
/** The check glyph used app-wide to mean "watched" — shared so the graph can reuse it. */
export function CheckIcon({ className = 'size-3.5' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="none">
      <path
        d="M3 8.5l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  )
}

export function WatchToggle({ movieId, watched, title, size = 'md' }) {
  const dimension = size === 'sm' ? 'size-6' : 'size-7'

  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? `Mark ${title} unwatched` : `Mark ${title} watched`}
      title={watched ? 'Watched' : 'Mark watched'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleWatched(movieId)
      }}
      className={[
        dimension,
        'grid place-items-center border backdrop-blur transition-colors',
        watched
          ? 'border-ok/60 bg-ok/20 text-ok'
          : 'border-hairline-strong bg-base/70 text-ink-faint hover:border-ink-faint hover:text-ink',
      ].join(' ')}
    >
      <CheckIcon className="size-3.5" />
    </button>
  )
}

/** A thin completion bar. Percentage is shown by the caller. */
export function ProgressBar({ percent, accent = 'var(--color-ok)' }) {
  return (
    <div
      className="h-1 w-full bg-hairline"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full transition-[width] duration-300"
        style={{ width: `${percent}%`, backgroundColor: accent }}
      />
    </div>
  )
}
