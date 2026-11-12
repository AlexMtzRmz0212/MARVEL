import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

import { useMovies } from '../api/catalog'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { episodesWatched, isPlanned, isWatching } from '../lib/watchStorage'
import { LineBullet } from './LineBullet'
import { TitleLink } from './TitlePeek'
import { ProgressBar } from './WatchToggle'

/**
 * What you are in the middle of, on every page: a deck of poster cards tipped
 * over and tucked against the left edge, a sliver of it showing. Click it and
 * the deck is dealt into a hand -- a fan of covers, each a link back into the
 * title. Click anywhere else, press Escape, or follow a card, and it is swept
 * up again.
 *
 * A title is in the deck if it was marked Watching by hand, or it is a series
 * with some of its episodes ticked (see `isWatching`), or it was marked Want to
 * watch (see `isPlanned`). What is under way comes first, then what is lined up.
 * Renders nothing for someone with neither, so it costs no space.
 *
 * Fixed to the viewport rather than placed in a page, which is what makes it
 * "everywhere" without every page having to remember it. It is also why the
 * collapsed deck is deliberately thin: it sits over the page's left gutter.
 */

/** A hand is a fan; past this many it stops being legible, so the rest wait. */
const MAX_IN_HAND = 7

/** When there is plenty of both, at least this many want-to-watch cards are dealt. */
const MIN_PLANNED = 3

/** The narrator's box takes the saga's colour, as everywhere else in the app. */
function captionFor(movie) {
  if (movie.saga === 'Multiverse Saga') return 'caption-multiverse'
  return ''
}

/** "2 watching · 3 to watch", leaving out whichever is none. */
function summary(watching, planned) {
  return [watching && `${watching} watching`, planned && `${planned} to watch`]
    .filter(Boolean)
    .join(' · ')
}

/** A pile's heading, set above the hand at the x of its first card. */
function PileLabel({ index, gap, tone, children }) {
  return (
    <span
      style={{ '--i': index, '--g': gap }}
      className={[
        'station absolute top-[-7.5rem] left-[calc(3rem+var(--i)*var(--step)+var(--g)*var(--gap))] px-2 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase sm:top-[-9.5rem]',
        tone === 'planned' ? 'bg-infinity text-on-infinity' : 'bg-multiverse text-on-multiverse',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

const episodeTotal = (movie) => (movie.episode_count > 1 ? movie.episode_count : 0)

export function WatchingDeck() {
  const { data: movies } = useMovies({ order: 'release' })
  const progress = useWatchProgress()
  const { pathname } = useLocation()
  // The page the hand was dealt on. Following a card changes the page, and the
  // hand should not still be held up over the next one.
  const [openOn, setOpenOn] = useState(null)
  const open = openOn === pathname
  const setOpen = (next) => setOpenOn(next ? pathname : null)
  const toggleRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key !== 'Escape') return
      setOpenOn(null)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const watching = (movies ?? []).filter((movie) =>
    isWatching(progress, movie.id, episodeTotal(movie)),
  )
  const planned = (movies ?? []).filter((movie) => isPlanned(progress, movie.id))
  if (watching.length + planned.length === 0) return null

  // Both piles get a place in the hand: what is under way is dealt first, but
  // a long run of it must not squeeze out everything that is lined up.
  const plannedRoom = watching.length > 0 ? Math.min(planned.length, MIN_PLANNED) : planned.length
  const watchingShown = watching.slice(0, MAX_IN_HAND - plannedRoom)
  const plannedShown = planned.slice(0, MAX_IN_HAND - watchingShown.length)
  const hand = [...watchingShown, ...plannedShown]
  const middle = (hand.length - 1) / 2
  // A gap between the two piles, so the fan reads as two groups.
  const split = watchingShown.length > 0 && plannedShown.length > 0

  return (
    <>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-ink/40"
        />
      )}

      <aside
        aria-label="Watching and want to watch"
        data-open={open}
        // Vertically centred on the viewport, clear of the phone's tab bar.
        className={`group/deck pointer-events-none fixed top-[46%] left-0 ${open ? 'z-50' : 'z-[35]'} h-0 w-0 [--hide:-68%] [--step:1.9rem] [--gap:1rem] sm:[--hide:-58%] sm:[--step:4rem] sm:[--gap:2.5rem]`}
      >
        {/* The deck is one button: the whole stack is the hit target. */}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-label={`Watching and want to watch, ${summary(watching.length, planned.length)}`}
          onClick={() => setOpen(!open)}
          className={[
            'pointer-events-auto absolute top-1/2 left-0 h-44 w-16 -translate-y-1/2 cursor-pointer sm:h-56 sm:w-20',
            open ? 'hidden' : '',
          ].join(' ')}
        />

        <ul className="m-0 list-none p-0">
          {hand.map((movie, index) => {
            const count = episodeTotal(movie)
            const seen = episodesWatched(progress, movie.id, count).length
            const lined = isPlanned(progress, movie.id)
            const offset = index - middle
            const apart = split && lined ? 1 : 0
            return (
              <li
                key={movie.id}
                inert={!open}
                style={{ '--i': index, '--o': offset, '--g': apart, zIndex: lined ? index : 10 + index }}
                className={[
                  'deck-card absolute top-0 left-0 w-28 transition-transform duration-300 ease-out sm:w-40 motion-reduce:transition-none',
                  open ? 'pointer-events-auto' : 'pointer-events-none',
                ].join(' ')}
              >
                <TitleLink
                  movieId={movie.id}
                  // The peek opens over the page, so the hand is put away.
                  onClick={() => setOpenOn(null)}
                  className="group relative block transition-transform duration-150 hover:-translate-y-2"
                >
                  <div className="relative aspect-[2/3] overflow-hidden border-[3px] border-ink bg-raised shadow-[5px_5px_0_var(--color-panel-shadow)]">
                    {movie.poster_url && (
                      <img
                        src={movie.poster_url}
                        alt=""
                        width={500}
                        height={750}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    )}
                    <LineBullet movie={movie} className="absolute top-1.5 left-1.5 size-7" />
                    <span
                      className={[
                        'station absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                        lined ? 'bg-infinity text-on-infinity' : 'bg-multiverse text-on-multiverse',
                      ].join(' ')}
                    >
                      {lined ? 'To watch' : 'Watching'}
                    </span>
                    {!lined && count > 0 && (
                      <div className="absolute inset-x-0 bottom-0 bg-paper/90 px-1.5 py-1">
                        <ProgressBar percent={Math.round((seen / count) * 100)} />
                      </div>
                    )}
                  </div>
                  <span
                    className={`caption ${captionFor(movie)} absolute -bottom-3 -left-1.5 max-w-[calc(100%+0.5rem)] !text-xs leading-tight text-pretty group-hover:underline sm:!text-sm`}
                  >
                    {movie.title}
                  </span>
                </TitleLink>
              </li>
            )
          })}
        </ul>

        {/* One label over each pile, at the head of its first card. Above rather
            than below, so a short screen cannot push them off the bottom. */}
        {open && (
          <div aria-hidden="true" className="pointer-events-none">
            {watchingShown.length > 0 && (
              <PileLabel index={0} gap={0} tone="watching">
                Watching · {watching.length}
              </PileLabel>
            )}
            {plannedShown.length > 0 && (
              <PileLabel index={watchingShown.length} gap={split ? 1 : 0} tone="planned">
                To watch · {planned.length}
              </PileLabel>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
