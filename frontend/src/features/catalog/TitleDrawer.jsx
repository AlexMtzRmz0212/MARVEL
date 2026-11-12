import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useMovie } from '../../api/catalog'
import { LineBullet } from '../../components/LineBullet'
import { StatusPicker } from '../../components/StatusPicker'
import { WatchToggle } from '../../components/WatchToggle'
import { LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { MEDIA_LABEL, formatRuntime, year } from '../../lib/format'
import { isWatched } from '../../lib/watchStorage'

/**
 * A title, opened beside the catalog instead of replacing it.
 *
 * A side panel rather than a modal: the grid stays on screen and usable, so
 * someone searching can look at a result, close it and try the next without
 * losing their place or their filters. "Open fully" is the way out to the
 * whole page. Escape closes it, and the caller decides where focus goes after.
 */
export function TitleDrawer({ movieId, summary, onClose }) {
  const { data: detail, isPending } = useMovie(movieId)
  const progress = useWatchProgress()
  const closeRef = useRef(null)
  const movie = detail ?? summary
  // Closing slides the panel out first, and only then lets go of it. The page
  // behind is told at the same moment (via `data-peek` on <html>), so whatever
  // was pushed aside eases back in step with the panel leaving.
  const [leaving, setLeaving] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const requestClose = useCallback(() => {
    setLeaving(true)
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
  }, [movieId])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.peek = leaving ? 'closing' : 'open'
    return () => {
      delete root.dataset.peek
    }
  }, [leaving])

  useEffect(() => {
    if (!leaving) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => onCloseRef.current(), reduced ? 0 : 260)
    return () => clearTimeout(timer)
  }, [leaving])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  if (!movie) return null

  const watched = isWatched(progress, movie.id)
  const runtime = formatRuntime(movie.runtime_min)
  const facts = [
    year(movie.release_date),
    movie.media_type === 'film' ? runtime : MEDIA_LABEL[movie.media_type],
    movie.universe,
    movie.in_universe_date && `Set in ${movie.in_universe_date}`,
  ].filter(Boolean)

  return (
    <aside
      aria-label={`${movie.title}, details`}
      className={[
        'floating fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto border-l-2 border-ink bg-surface text-ink shadow-2xl',
        leaving ? 'animate-peek-out' : 'animate-peek-in',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <span className="label text-ink-dim">Title</span>
        <button ref={closeRef} type="button" className="btn btn-sm" onClick={requestClose}>
          Close
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        <div className="flex gap-4">
          {movie.poster_url && (
            <img
              src={movie.poster_url}
              alt={`Poster for ${movie.title}`}
              width={500}
              height={750}
              className="aspect-[2/3] w-28 shrink-0 border-2 border-ink object-cover"
            />
          )}
          <div className="min-w-0">
            <LineBullet movie={movie} />
            <h2 className="display mt-2 text-3xl text-balance text-ink">{movie.title}</h2>
            <p className="meta mt-2">{facts.join(', ')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <WatchToggle
            movieId={movie.id}
            watched={watched}
            title={movie.title}
            episodeCount={movie.episode_count ?? movie.episodes?.length ?? 0}
          />
          <StatusPicker
            movieId={movie.id}
            episodeCount={movie.episode_count ?? movie.episodes?.length ?? 0}
          />
        </div>

        {isPending && !detail ? (
          <LoadingState label="Loading details" />
        ) : (
          <>
            {detail?.synopsis && (
              <p className="text-sm leading-relaxed text-ink-dim">{detail.synopsis}</p>
            )}
            {detail?.prerequisites && (
              <p className="meta">
                {detail.prerequisites.length === 0
                  ? 'Nothing to watch first. A starting point.'
                  : `Watch first: ${detail.prerequisites.map((item) => item.title).join(', ')}`}
              </p>
            )}
          </>
        )}

        <Link to={`/movies/${movie.id}`} className="btn btn-primary w-full justify-center">
          Open fully
        </Link>
      </div>
    </aside>
  )
}
