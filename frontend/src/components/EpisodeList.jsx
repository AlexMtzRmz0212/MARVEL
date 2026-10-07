import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useMovie } from '../api/catalog'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { formatRuntime } from '../lib/format'
import { episodesWatched, markEpisodesThrough, setEpisodes, toggleEpisode } from '../lib/watchStorage'
import { LoadingState } from './states'

/** Above this many episodes a segment each gets too thin to read; draw a bar. */
const MAX_SEGMENTS = 24

/**
 * How far into a season, drawn the way a comic numbers its panels: one cell
 * per episode, filled once seen. A long season becomes one continuous bar.
 */
export function EpisodeTrack({ watched, total, className = '' }) {
  if (total > MAX_SEGMENTS) {
    return (
      <div aria-hidden="true" className={`h-1.5 w-full bg-raised ${className}`}>
        <div className="h-full bg-ok" style={{ width: `${(watched / total) * 100}%` }} />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className={`flex h-1.5 w-full gap-px ${className}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`flex-1 ${index < watched ? 'bg-ok' : 'bg-raised'}`} />
      ))}
    </div>
  )
}

/**
 * Which episodes hold a credits scene, by position in this entry's list.
 *
 * The seed file numbers credits scenes the way TMDb numbers episodes, within
 * a season. That lines up with positions only for an entry that is one whole
 * season; a split season or a two-season entry has none recorded anyway.
 */
function creditPositions(movie) {
  const episodes = movie.episodes ?? []
  const seasons = new Set(episodes.map((episode) => episode.season))
  if (seasons.size !== 1) return new Map()
  const counts = new Map((movie.credit_scene_episodes ?? []).map((item) => [item.episode, item.count]))
  const positions = new Map()
  episodes.forEach((episode, index) => {
    if (counts.has(episode.episode)) positions.set(index + 1, counts.get(episode.episode))
  })
  return positions
}

/**
 * Every episode of a series entry, ticked off one by one.
 *
 * Takes the detail-shaped title (the list is detail-only). Ticking the last
 * episode marks the whole entry watched; that rule lives in the store, so the
 * card, this list and the check button can never disagree about it.
 */
export function EpisodeList({ movie }) {
  const progress = useWatchProgress()
  const episodes = movie.episodes ?? []
  const total = episodes.length
  const ticked = new Set(episodesWatched(progress, movie.id, total))
  const credits = creditPositions(movie)
  // The first unticked episode is the one to put on next.
  const nextUp = episodes.findIndex((_, index) => !ticked.has(index + 1)) + 1
  const multiSeason = new Set(episodes.map((episode) => episode.season)).size > 1

  if (total === 0) return null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-ink tabular-nums">
          {ticked.size} of {total} watched
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={ticked.size === total}
            onClick={() => setEpisodes(movie.id, episodes.map((_, index) => index + 1), total)}
          >
            Tick all
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={ticked.size === 0}
            onClick={() => setEpisodes(movie.id, [], total)}
          >
            Clear
          </button>
        </div>
      </div>
      <EpisodeTrack watched={ticked.size} total={total} className="mb-2" />

      <ol className="divide-y divide-hairline">
        {episodes.map((episode, index) => {
          const position = index + 1
          const checked = ticked.has(position)
          const id = `episode-${movie.id}-${position}`
          return (
            <li key={position} className="flex items-center gap-3 py-2">
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={() => toggleEpisode(movie.id, position, total)}
                className="size-5 shrink-0 cursor-pointer accent-[var(--color-ok)]"
              />
              <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2">
                <span className="meta w-12 shrink-0 tabular-nums">
                  {multiSeason ? `S${episode.season} ` : ''}E{episode.episode}
                </span>
                <span
                  className={`min-w-0 flex-1 text-sm font-semibold text-pretty ${checked ? 'text-ink-dim' : 'text-ink'}`}
                >
                  {episode.name}
                  {position === nextUp && (
                    <span className="ml-2 bg-infinity px-1.5 py-0.5 align-middle text-xs font-bold text-on-infinity uppercase">
                      Next
                    </span>
                  )}
                </span>
              </label>
              {credits.has(position) && (
                <span
                  className="burst size-8 shrink-0 -rotate-12 text-xs"
                  title={`${credits.get(position)} scene${credits.get(position) === 1 ? '' : 's'} after the credits`}
                >
                  <span aria-hidden="true">+{credits.get(position)}</span>
                  <span className="sr-only">Stay for the credits</span>
                </span>
              )}
              <span className="meta hidden w-12 shrink-0 text-right tabular-nums sm:inline">
                {formatRuntime(episode.runtime_min)}
              </span>
              {position > 1 && !checked && (
                <button
                  type="button"
                  onClick={() => markEpisodesThrough(movie.id, position, total)}
                  className="shrink-0 text-xs font-semibold text-ink-dim underline underline-offset-2 hover:text-ink"
                  aria-label={`Mark episodes 1 to ${position} watched`}
                >
                  Up to here
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * The episode list in a sheet over the page: a bottom sheet on a phone, a
 * centred panel on anything wider. A native `<dialog>`, so focus trapping,
 * Escape and the backdrop come from the browser.
 *
 * Portalled to `<body>`: the catalog grid puts `content-visibility` on every
 * card, and a dialog rendered inside that containment can be clipped with it.
 */
export function EpisodeSheet({ movieId, title, open, onClose }) {
  const dialog = useRef(null)
  const { data: movie, isPending } = useMovie(open ? movieId : null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return createPortal(
    <dialog
      ref={dialog}
      aria-label={`${title} episodes`}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
      className="floating mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none overflow-y-auto p-0 text-ink backdrop:bg-black/60 sm:m-auto sm:max-w-lg"
    >
      {open && (
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-start gap-3">
            <h2 className="display flex-1 text-3xl text-ink">{title}</h2>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          {isPending || !movie ? <LoadingState label="Loading episodes" /> : <EpisodeList movie={movie} />}
        </div>
      )}
    </dialog>,
    document.body,
  )
}
