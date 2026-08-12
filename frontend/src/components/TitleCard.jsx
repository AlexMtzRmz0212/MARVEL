import { Link } from 'react-router'

import { useWatchProgress } from '../hooks/useWatchProgress'
import { MEDIA_LABEL, accentFor, formatRuntime, phaseLabel, year } from '../lib/format'
import { isWatched } from '../lib/watchStorage'
import { WatchToggle } from './WatchToggle'

/**
 * A catalog entry.
 *
 * Designed to look deliberate with no poster art, because the curated seed
 * ships without any: the artwork slot becomes a large mono index number in the
 * saga accent, which reads as a catalogue number rather than a missing image.
 * When `poster_url` is filled in by the enrichment script, the same slot shows
 * the poster instead with no layout change.
 */
export function TitleCard({ movie, index }) {
  const progress = useWatchProgress()
  const watched = isWatched(progress, movie.id)
  const accent = accentFor(movie)
  const runtime = formatRuntime(movie.runtime_min)
  const isAdjacent = movie.tier === 'adjacent'

  return (
    <Link
      to={`/movies/${movie.id}`}
      className={`group hairline relative flex flex-col overflow-hidden border bg-surface transition-colors hover:border-hairline-strong ${
        isAdjacent ? 'opacity-70 hover:opacity-100' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: accent }}
      />

      <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden bg-raised">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt=""
            loading="lazy"
            className={[
              'size-full object-cover transition-all duration-300 group-hover:scale-[1.03]',
              // Watched titles recede so the remaining ones stand out, which is
              // what you actually scan a catalogue this long for.
              watched ? 'opacity-40 saturate-50 brightness-60 group-hover:opacity-70' : '',
            ].join(' ')}
          />
        ) : (
          <span
            className="font-mono text-5xl font-light tabular-nums opacity-25 transition-opacity group-hover:opacity-40"
            style={{ color: accent }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        )}

        <div className="absolute top-1.5 right-1.5">
          <WatchToggle movieId={movie.id} watched={watched} title={movie.title} size="sm" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 pl-4">
        <h3 className="text-sm leading-snug font-medium text-ink">{movie.title}</h3>
        <p className="meta mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{year(movie.release_date)}</span>
          <span aria-hidden="true">·</span>
          <span>{phaseLabel(movie.phase)}</span>
          {runtime && (
            <>
              <span aria-hidden="true">·</span>
              <span>{runtime}</span>
            </>
          )}
          {movie.media_type !== 'film' && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: accent }}>{MEDIA_LABEL[movie.media_type]}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  )
}
