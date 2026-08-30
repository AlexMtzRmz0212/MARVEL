import { Link } from 'react-router'

import { useWatchProgress } from '../hooks/useWatchProgress'
import {
  MEDIA_LABEL,
  accentFor,
  creditScenesLabel,
  formatRuntime,
  isOutsideMcu,
  phaseLabel,
  year,
} from '../lib/format'
import { isWatched } from '../lib/watchStorage'
import { WatchToggle } from './WatchToggle'

/**
 * A catalog entry.
 *
 * The artwork slot holds the poster when `poster_url` is set and a neutral
 * placeholder mark when it is not, with no layout change between the two. The
 * placeholder is deliberately not a number: an oversized index numeral in the
 * slot reads as decoration rather than as a missing image, and the card already
 * carries its identifying metadata underneath.
 */
export function TitleCard({ movie }) {
  const progress = useWatchProgress()
  const watched = isWatched(progress, movie.id)
  const accent = accentFor(movie)
  const runtime = formatRuntime(movie.runtime_min)
  const outsideMcu = isOutsideMcu(movie)
  const creditScenes = movie.credit_scenes

  return (
    <Link
      to={`/movies/${movie.id}`}
      className={`group hairline relative flex flex-col overflow-hidden border bg-surface transition-colors hover:border-hairline-strong ${
        outsideMcu ? 'opacity-70 hover:opacity-100' : ''
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
          // No artwork on file. A framed mark in the saga accent, so the slot
          // reads as an empty sleeve in a catalogue rather than a broken image.
          <svg
            viewBox="0 0 48 64"
            aria-hidden="true"
            className="h-2/5 w-auto opacity-30 transition-opacity group-hover:opacity-45"
            fill="none"
          >
            <rect
              x="1"
              y="1"
              width="46"
              height="62"
              stroke="var(--color-hairline-strong)"
              strokeWidth="2"
            />
            <path d="M1 46 L17 30 L31 44 L38 37 L47 46" stroke={accent} strokeWidth="2" />
            <circle cx="32" cy="17" r="5" stroke={accent} strokeWidth="2" />
          </svg>
        )}

        <div className="absolute top-1.5 right-1.5">
          <WatchToggle movieId={movie.id} watched={watched} title={movie.title} size="sm" />
        </div>

        {/* The wink: something is still coming after the picture ends. Drawn
         * only for a positive count -- a recorded zero and an unrecorded title
         * both leave the corner empty, and the detail page tells them apart. */}
        {creditScenes > 0 && (
          <span className="absolute bottom-1.5 left-1.5 border border-hairline-strong bg-base/85 px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums text-ink-dim">
            <span aria-hidden="true">+{creditScenes}</span>
            <span className="sr-only">{creditScenesLabel(creditScenes)}</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 pl-4">
        <h2 className="text-sm leading-snug font-medium text-ink">{movie.title}</h2>
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
