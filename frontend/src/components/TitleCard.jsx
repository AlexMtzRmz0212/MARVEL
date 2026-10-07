import { useState } from 'react'
import { Link } from 'react-router'

import { useWatchProgress } from '../hooks/useWatchProgress'
import { MEDIA_LABEL, creditScenesLabel, formatRuntime, year } from '../lib/format'
import { episodesWatched, isWatched, statusOf } from '../lib/watchStorage'
import { EpisodeSheet, EpisodeTrack } from './EpisodeList'
import { LineBullet } from './LineBullet'
import { WatchToggle } from './WatchToggle'

/**
 * A catalog entry.
 *
 * The artwork slot holds the poster when `poster_url` is set and a neutral
 * placeholder mark when it is not, with no layout change between the two. The
 * saga is carried by the roundel in the corner, which prints the phase number
 * as well as the line colour, so it is never told by colour alone.
 *
 * Watched titles are screened back with a halftone rather than faded with
 * opacity: the poster recedes, the title underneath keeps its full contrast.
 */
export function TitleCard({ movie }) {
  const progress = useWatchProgress()
  const watched = isWatched(progress, movie.id)
  const unsure = statusOf(progress, movie.id) === 'unsure'
  // Episode tracking is for series with an episode list; a one-episode
  // special has nothing to count beyond the check button.
  const episodeTotal = movie.episode_count > 1 ? movie.episode_count : 0
  const episodesSeen = episodesWatched(progress, movie.id, episodeTotal).length
  const [sheetOpen, setSheetOpen] = useState(false)
  const runtime = formatRuntime(movie.runtime_min)
  const creditScenes = movie.credit_scenes
  const details = [
    year(movie.release_date),
    movie.media_type === 'film' ? runtime : MEDIA_LABEL[movie.media_type],
  ].filter(Boolean)

  return (
    <>
      <Link
        to={`/movies/${movie.id}`}
        className="group panel relative flex h-full flex-col overflow-hidden transition-colors hover:bg-raised"
      >
        <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden border-b-2 border-ink bg-raised">
          {movie.poster_url ? (
            <img
              src={movie.poster_url}
              alt=""
              width={500}
              height={750}
              loading="lazy"
              decoding="async"
              className={`poster size-full object-cover ${watched ? 'grayscale-[60%]' : ''}`}
            />
          ) : (
            // No artwork on file. A framed mark, so the slot reads as an empty
            // sleeve in a catalogue rather than a broken image.
            <svg viewBox="0 0 48 64" aria-hidden="true" className="h-2/5 w-auto" fill="none">
              <rect x="1" y="1" width="46" height="62" stroke="var(--color-hairline-strong)" strokeWidth="2" />
              <path d="M1 46 L17 30 L31 44 L38 37 L47 46" stroke="var(--color-hairline-strong)" strokeWidth="2" />
              <circle cx="32" cy="17" r="5" stroke="var(--color-hairline-strong)" strokeWidth="2" />
            </svg>
          )}

          {/* A title from the Multiverse Saga glitches when you reach for it,
              the way characters from another universe do when they are not
              where they belong. */}
          {movie.poster_url && movie.saga === 'Multiverse Saga' && (
            <>
              <span aria-hidden="true" className="glitch-slice" style={{ '--poster': `url(${movie.poster_url})` }} />
              <span aria-hidden="true" className="glitch-slice" style={{ '--poster': `url(${movie.poster_url})` }} />
            </>
          )}

          {watched && <span aria-hidden="true" className="halftone-screen absolute inset-0" />}

          <LineBullet movie={movie} className="absolute top-1.5 left-1.5" />

          <div className="absolute top-1 right-1">
            <WatchToggle
              movieId={movie.id}
              watched={watched}
              title={movie.title}
              size="sm"
              episodeCount={movie.episode_count}
            />
          </div>

          {/* Marked "don't recall" in quick sort: a question hung on the poster
              so the maybes stand out when browsing for something to rewatch. */}
          {unsure && (
            <span
              aria-hidden="true"
              className="station absolute right-1 bottom-1 grid size-7 place-items-center bg-infinity font-bold text-on-infinity"
              title="You couldn't remember this one"
            >
              ?
            </span>
          )}

          {/* The wink: something is still coming after the picture ends. Drawn
           * only for a positive count -- a recorded zero and an unrecorded title
           * both leave the corner empty, and the detail page tells them apart. */}
          {episodeTotal > 0 && (
            <EpisodeTrack
              watched={episodesSeen}
              total={episodeTotal}
              className="absolute inset-x-0 bottom-0 border-t-2 border-ink !h-2"
            />
          )}

          {creditScenes > 0 && (
            <span className="burst absolute bottom-1 left-1 size-11 -rotate-12 text-sm tabular-nums">
              <span aria-hidden="true">+{creditScenes}</span>
              <span className="sr-only">{creditScenesLabel(creditScenes)}</span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <h2 className="text-sm leading-snug font-bold text-pretty text-ink group-hover:underline group-hover:underline-offset-2">
            {movie.title}
          </h2>
          <p className="meta mt-auto">
            {details.join(', ')}
            {watched && <span className="text-ok">, seen</span>}
            {unsure && <span>, don't recall</span>}
          </p>
          {episodeTotal > 0 && (
            // Sits inside the link but never follows it: opening the sheet is
            // its own action, and the sheet itself is rendered outside the link.
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setSheetOpen(true)
              }}
              className="btn btn-sm mt-1 w-full justify-between"
              aria-haspopup="dialog"
              aria-label={`Episodes of ${movie.title}: ${episodesSeen} of ${episodeTotal} watched`}
            >
              <span>Episodes</span>
              <span className="tabular-nums">
                {episodesSeen}/{episodeTotal}
              </span>
            </button>
          )}
        </div>
      </Link>
      {sheetOpen && (
        <EpisodeSheet movieId={movie.id} title={movie.title} open onClose={() => setSheetOpen(false)} />
      )}
    </>
  )
}
