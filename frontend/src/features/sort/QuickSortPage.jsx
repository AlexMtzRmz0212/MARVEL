import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { useMovies } from '../../api/catalog'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { phaseLabel } from '../../lib/format'
import { getSnapshot, restoreEntry, setStatus, sortCounts, statusOf } from '../../lib/watchStorage'
import { SwipeCard } from './SwipeCard'
import { DIRECTIONS, VERDICT, buildQueue } from './swipe'
import { useSwipeGesture } from './useSwipeGesture'

/**
 * Quick sort: one poster at a time, and a thumb.
 *
 * Marking 120 titles one check button at a time is the chore that stops people
 * setting this app up at all. Here every title costs one gesture -- right for
 * seen, left for not, down for "I can't remember" -- and arrow keys or the
 * three buttons do the same for anyone without a touch screen.
 *
 * "Not seen" and "don't recall" are recorded, not skipped: the deck only deals
 * titles nobody has sorted, so a second visit picks up where the first left
 * off, and the don't-recalls form their own pile to come back to.
 */

const KINDS = [
  { value: 'all', label: 'Everything' },
  { value: 'film', label: 'Films' },
  { value: 'series', label: 'Series' },
]

/** How long the card takes to leave the table. Zero under reduced motion. */
const FLY_MS = 240

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Keys typed into a field belong to the field, not the deck. */
function isTyping(target) {
  return target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable]')
}

export function QuickSortPage() {
  const progress = useWatchProgress()
  const [order, setOrder] = useState('release')
  const [filters, setFilters] = useState({ mode: 'unsorted', kind: 'all', phase: null })
  // Bumped by "start again", which rebuilds the queue from what is left.
  const [round, setRound] = useState(0)
  const { data: movies, isPending, error, refetch } = useMovies({ order })

  const counts = useMemo(
    () => (movies ? sortCounts(progress, movies.map((movie) => movie.id)) : null),
    [movies, progress],
  )
  const phases = useMemo(
    () => [...new Set((movies ?? []).map((movie) => movie.phase).filter(Boolean))].sort((a, b) => a - b),
    [movies],
  )

  function update(patch) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  return (
    <div className="py-4 sm:py-8">
      <div className="pb-3 sm:pb-5">
        <h1 className="display text-4xl text-ink sm:text-6xl">Quick sort</h1>
        <p className="mt-1 text-sm text-ink-dim sm:mt-2 sm:text-base">
          <span className="font-semibold text-ink">Right</span> seen,{' '}
          <span className="font-semibold text-ink">left</span> not seen,{' '}
          <span className="font-semibold text-ink">down</span> don't recall.
          <span className="hidden sm:inline"> Arrow keys work too; Z takes the last one back.</span>
        </p>
      </div>

      {/* One strip that scrolls sideways on a phone rather than wrapping into
          three rows and pushing the card off the bottom of the screen. */}
      <div
        className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="What to sort"
      >
        <button
          type="button"
          className="chip shrink-0"
          aria-pressed={filters.mode === 'unsorted'}
          onClick={() => update({ mode: 'unsorted' })}
        >
          Unsorted{counts && <span className="tabular-nums">{counts.unsorted}</span>}
        </button>
        <button
          type="button"
          className="chip shrink-0"
          aria-pressed={filters.mode === 'revisit'}
          onClick={() => update({ mode: 'revisit' })}
        >
          Don't recall{counts && <span className="tabular-nums">{counts.unsure}</span>}
        </button>
        <span aria-hidden="true" className="mx-1 h-6 w-0.5 shrink-0 bg-hairline" />
        {KINDS.map((kind) => (
          <button
            key={kind.value}
            type="button"
            className="chip shrink-0"
            aria-pressed={filters.kind === kind.value}
            onClick={() => update({ kind: kind.value })}
          >
            {kind.label}
          </button>
        ))}
        <label className="sr-only" htmlFor="sort-phase">
          Phase
        </label>
        <select
          id="sort-phase"
          className="field !min-h-8 !w-auto shrink-0 !py-0.5 text-sm"
          value={filters.phase ?? ''}
          onChange={(event) => update({ phase: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Any phase</option>
          {phases.map((phase) => (
            <option key={phase} value={phase}>
              {phaseLabel(phase)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="sort-order">
          Deal in
        </label>
        <select
          id="sort-order"
          className="field !min-h-8 !w-auto shrink-0 !py-0.5 text-sm"
          value={order}
          onChange={(event) => setOrder(event.target.value)}
        >
          <option value="release">Release order</option>
          <option value="chronological">Story order</option>
        </select>
      </div>

      {isPending ? (
        <LoadingState label="Shuffling the deck" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        // A new key is a new session: the queue is dealt once, from whatever is
        // unsorted at that moment, and not re-dealt as the cards are sorted.
        <Deck
          key={`${order}|${filters.mode}|${filters.kind}|${filters.phase}|${round}`}
          movies={movies}
          filters={filters}
          counts={counts}
          onRevisit={() => update({ mode: 'revisit', kind: 'all', phase: null })}
          onRestart={() => {
            setFilters({ mode: 'unsorted', kind: 'all', phase: null })
            setRound((value) => value + 1)
          }}
        />
      )}
    </div>
  )
}

function Deck({ movies, filters, counts, onRevisit, onRestart }) {
  const byId = useMemo(() => new Map(movies.map((movie) => [movie.id, movie])), [movies])
  const [queue] = useState(() => buildQueue(movies, getSnapshot(), filters, statusOf))
  const [index, setIndex] = useState(0)
  // Each verdict with the entry it replaced, so undo restores exactly.
  const [history, setHistory] = useState([])
  const [leaving, setLeaving] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const current = byId.get(queue[index])
  const next = byId.get(queue[index + 1])
  const { offset, handlers, reset } = useSwipeGesture({ onSwipe: commit, disabled: !current || Boolean(leaving) })

  function commit(direction) {
    if (!current || leaving) return
    setLeaving(direction)
    const movie = current
    const previous = getSnapshot()[movie.id]
    window.setTimeout(
      () => {
        setStatus(movie.id, VERDICT[direction], movie.episode_count ?? 0)
        setHistory((stack) => [...stack, { id: movie.id, previous, direction }])
        setAnnouncement(`${movie.title}: ${DIRECTIONS[direction].label.toLowerCase()}.`)
        setIndex((value) => value + 1)
        setLeaving(null)
        reset()
      },
      prefersReducedMotion() ? 0 : FLY_MS,
    )
  }

  function undo() {
    if (leaving || history.length === 0) return
    const last = history[history.length - 1]
    restoreEntry(last.id, last.previous)
    setHistory((stack) => stack.slice(0, -1))
    setIndex((value) => value - 1)
    setAnnouncement(`Took back ${byId.get(last.id)?.title ?? 'that one'}.`)
  }

  // Re-registered every render so the handler always sees the current card.
  useEffect(() => {
    function onKey(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (isTyping(event.target)) return
      const direction = Object.keys(DIRECTIONS).find((key) => DIRECTIONS[key].key === event.key)
      if (direction && current) {
        event.preventDefault()
        commit(direction)
      } else if (event.key === 'z' || event.key === 'Backspace') {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tally = history.reduce((sum, item) => ({ ...sum, [item.direction]: (sum[item.direction] ?? 0) + 1 }), {})

  return (
    <div className="flex flex-col items-center">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {current ? (
        <>
          <p className="meta mb-2 tabular-nums">
            {queue.length - index} left
            {history.length > 0 && `, ${history.length} sorted`}
          </p>
          <div
            className="relative"
            // Sized so the card and the buttons under it fit one phone screen.
            style={{ width: 'min(20rem, 76vw, calc((100dvh - 25rem) * 2 / 3))', aspectRatio: '2 / 3' }}
          >
            {next && <SwipeCard key={next.id} movie={next} behind />}
            <SwipeCard
              key={current.id}
              movie={current}
              offset={offset}
              leaving={leaving}
              handlers={handlers}
            />
          </div>
        </>
      ) : (
        <Finished
          sortedNow={history.length}
          tally={tally}
          emptyFromStart={queue.length === 0}
          mode={filters.mode}
          counts={counts}
          onRevisit={onRevisit}
          onRestart={onRestart}
        />
      )}

      {current && (
        // Laid out the way the swipes go: left on the left, right on the
        // right, down in the middle.
        <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
          {['left', 'down', 'right'].map((direction) => (
            <button
              key={direction}
              type="button"
              className={`btn !h-auto flex-col !gap-0.5 !px-1 py-2 ${direction === 'right' ? 'btn-primary' : ''}`}
              onClick={() => commit(direction)}
              disabled={Boolean(leaving)}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {{ left: '←', down: '↓', right: '→' }[direction]}
              </span>
              {DIRECTIONS[direction].label}
            </button>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <button type="button" className="btn btn-sm mt-3" onClick={undo} disabled={Boolean(leaving)}>
          Undo last <span className="meta hidden sm:inline" aria-hidden="true">(Z)</span>
        </button>
      )}
    </div>
  )
}

function Finished({ sortedNow, tally, emptyFromStart, mode, counts, onRevisit, onRestart }) {
  const heading = emptyFromStart
    ? mode === 'revisit'
      ? 'No maybes left'
      : 'Nothing to sort here'
    : 'All sorted!'

  return (
    <div className="panel w-full max-w-md p-6 text-center">
      <p className="display text-4xl text-ink">{heading}</p>
      {sortedNow > 0 && (
        <p className="mt-3 text-sm text-ink-dim">
          {sortedNow} this round: {tally.right ?? 0} seen, {tally.left ?? 0} not seen,{' '}
          {tally.down ?? 0} don't recall.
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {mode !== 'revisit' && counts?.unsure > 0 && (
          <button type="button" className="btn btn-primary" onClick={onRevisit}>
            Revisit {counts.unsure} don't-recall{counts.unsure === 1 ? '' : 's'}
          </button>
        )}
        {counts?.unsorted > 0 && (
          <button type="button" className="btn" onClick={onRestart}>
            Sort the other {counts.unsorted}
          </button>
        )}
        <Link to="/progress" className="btn">
          See progress
        </Link>
      </div>
    </div>
  )
}
