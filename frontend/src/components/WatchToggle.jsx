import { useState } from 'react'

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
  const dimension = size === 'sm' ? 'size-7' : 'size-9'
  // Bumped each time a title is marked watched, so the sound effect replays
  // even on a quick second click. Never for un-watching: that is not an event.
  const [bang, setBang] = useState(0)

  return (
    <span className="relative inline-grid">
      <button
        type="button"
        aria-pressed={watched}
        aria-label={watched ? `Mark ${title} unwatched` : `Mark ${title} watched`}
        title={watched ? 'Watched' : 'Mark watched'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!watched) setBang((count) => count + 1)
          toggleWatched(movieId)
        }}
        className={[
          dimension,
          // A station: round and cased in ink. Filled cyan once watched.
          'station grid place-items-center transition-colors',
          watched
            ? 'bg-ok text-on-ok'
            : 'bg-surface text-ink-faint hover:bg-raised hover:text-ink',
        ].join(' ')}
      >
        <CheckIcon className="size-3.5" />
      </button>
      {bang > 0 && (
        // Decorative: the button's pressed state already says what happened.
        <span
          key={bang}
          aria-hidden="true"
          className="sfx top-full right-0 mt-1"
          onAnimationEnd={() => setBang(0)}
        >
          Seen!
        </span>
      )}
    </span>
  )
}

/**
 * Completion as a stretch of line: the part travelled is drawn in colour, the
 * rest is the bare track. Percentage is shown by the caller.
 */
export function ProgressBar({ percent, accent = 'var(--color-ok)' }) {
  return (
    <div
      className="h-2.5 w-full border-2 border-ink bg-surface"
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
