import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useMovies } from '../../api/catalog'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { accentFor, formatDate, formatTotalRuntime } from '../../lib/format'
import { claimSearch } from '../../lib/searchTarget'
import { isWatched } from '../../lib/watchStorage'
import { OrderColumn } from './OrderColumn'
import { ShiftLinks } from './ShiftLinks'

/**
 * The two orders side by side, and the distance between them.
 *
 * The catalog page can show either order but only one at a time, which answers
 * "what is next" and cannot answer "how far apart are these two really". That
 * question is about the *gap*, and a gap needs both ends on screen at once. So:
 * two vertical lines, every title marked on both, and a thread joining each
 * title's two positions. Something that sits in the same place in both orders
 * draws a flat line; a film released years after the events it depicts draws
 * one that falls half the height of the page.
 *
 * Neither list is computed here. Both are the API's own orders, fetched under
 * the same cache keys the catalog uses, so arriving from there costs nothing.
 * All this page adds is the join between them.
 *
 * The key doubles as the controls. A legend that only names things is furniture
 * on a page with three layers, and the switches want explaining anyway --
 * putting the switch next to the swatch means one panel says both what a line
 * is and whether it is drawn.
 */

/**
 * Row height, in pixels, and the one number the whole layout turns on.
 *
 * Both columns and the band between them are laid out from it: the columns give
 * every row exactly this height and the band puts a curve at `n * ROW`, which
 * is why nothing on this page is ever measured. Thirty clears the 24px floor
 * for a pointer target with room to spare and still sets 13px text
 * comfortably; much less and the labels touch, much more and the catalog is a
 * longer scroll than it needs to be.
 */
const ROW = 30

/**
 * How far into a chronological watch each title puts you.
 *
 * A title with no `runtime_min` cannot advance the total, so it does not, and
 * every figure after the first one passed is marked `+` to say the number is a
 * floor rather than a guess.
 *
 * Nothing in the catalog is missing one today. Sixteen were until the
 * enrichment script learned to total a series it could not address as a season
 * ("Loki: Season 2" was filled, "Loki" was not), and an unreleased series will
 * arrive with a null the same way -- silently understating every total below
 * it. So the mark stays, and the key explains it only when one is on screen.
 */
function runningTime(movies) {
  let minutes = 0
  let floor = false

  return movies.map((movie) => {
    if (movie.runtime_min) minutes += movie.runtime_min
    else floor = true

    const total = formatTotalRuntime(minutes)
    if (!total) return '--'
    return floor ? `${total}+` : total
  })
}

const KEY = [
  { label: 'Infinity Saga', colour: 'var(--color-infinity)' },
  { label: 'Multiverse Saga', colour: 'var(--color-multiverse)' },
  { label: 'Other / adjacent', colour: 'var(--color-adjacent)' },
  { label: 'Watched', colour: 'var(--color-ok)' },
]

/** A key entry that is also its own switch. */
function Line({ label, colour, checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="group flex min-h-8 w-full items-center gap-2.5 py-1 text-left disabled:cursor-not-allowed"
    >
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center border-2 ${
          disabled ? 'border-hairline-strong' : 'border-ink'
        }`}
      >
        {checked && <span className="size-2" style={{ backgroundColor: colour }} />}
      </span>
      <span
        className={`label transition-colors ${
          disabled ? 'text-ink-faint' : checked ? 'text-ink' : 'text-ink-dim group-hover:text-ink'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

function KeyMenu({ open, onToggle, show, setShow, canLink, floored }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="chip"
      >
        {open ? 'Hide key' : 'Key'}
      </button>

      {open && (
        <div className="floating absolute top-full right-0 z-20 mt-2 w-64">
          <div className="px-3 py-2.5">
            <p className="meta mb-1">Show</p>
            <Line
              label="Release order"
              colour="var(--color-ink)"
              checked={show.release}
              onChange={() => setShow((value) => ({ ...value, release: !value.release }))}
            />
            <Line
              label="Chronological"
              colour="var(--color-ink)"
              checked={show.chronological}
              onChange={() =>
                setShow((value) => ({ ...value, chronological: !value.chronological }))
              }
            />
            <Line
              label="Connections"
              colour="var(--color-ink)"
              checked={show.links && canLink}
              disabled={!canLink}
              onChange={() => setShow((value) => ({ ...value, links: !value.links }))}
            />
            <Line
              label="Release dates"
              colour="var(--color-ink)"
              checked={show.dates}
              onChange={() => setShow((value) => ({ ...value, dates: !value.dates }))}
            />
            <Line
              label="Running time"
              colour="var(--color-ink)"
              checked={show.runtime}
              onChange={() => setShow((value) => ({ ...value, runtime: !value.runtime }))}
            />
            {!canLink && (
              <p className="mt-1 text-xs leading-snug text-ink-dim">
                Both lines have to be up for a connection to join anything.
              </p>
            )}
            {show.runtime && floored && (
              <p className="mt-1 text-xs leading-snug text-ink-dim">
                Some series have no runtime on file, so a total marked + is a floor.
              </p>
            )}
          </div>

          <div className="border-t-2 border-ink px-3 py-2.5">
            <p className="meta mb-1">Colour</p>
            <ul>
              {KEY.map((entry) => (
                <li key={entry.label} className="flex items-center gap-2 py-0.5">
                  <span
                    aria-hidden="true"
                    className="station size-3 shrink-0 border-[1.5px]"
                    style={{ backgroundColor: entry.colour }}
                  />
                  <span className="meta text-ink">{entry.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

/** Where the pointed-at title sits in each order, and how far that is. */
function Readout({ movie, releaseAt, chronoAt }) {
  const shift = releaseAt - chronoAt
  const gap =
    shift === 0
      ? 'same place in both'
      : `${Math.abs(shift)} ${shift > 0 ? 'earlier' : 'later'} in the chronology`

  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <Link
        to={`/movies/${movie.id}`}
        className="truncate text-sm font-bold text-ink underline decoration-2 underline-offset-4 transition-colors hover:decoration-infinity"
      >
        {movie.title}
      </Link>
      <span className="meta">
        {`#${releaseAt + 1} release / #${chronoAt + 1} chronological / ${gap}`}
      </span>
    </p>
  )
}

export function ComparePage() {
  const releaseQuery = useMovies({ order: 'release' })
  const chronoQuery = useMovies({ order: 'chronological' })
  const progress = useWatchProgress()

  const [show, setShow] = useState({
    release: true,
    chronological: true,
    links: true,
    dates: true,
    runtime: true,
  })
  const [keyOpen, setKeyOpen] = useState(false)
  // Two separate things: pointing at a title lights it for as long as the
  // pointer is there, clicking keeps it lit so it survives a scroll. Pointing
  // wins while it lasts, which is what makes a hover a preview rather than a
  // change of state -- and clicking is what gives a touch screen, which cannot
  // hover, the same reading.
  const [hoverId, setHoverId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const pageRef = useRef(null)

  // The column headings stick under the app header, which is one row on a
  // desktop and two on a phone. Measured rather than assumed for that reason,
  // on the same `resize` listener the timeline page uses.
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header')
      setHeaderHeight(header?.getBoundingClientRect().height ?? 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const release = releaseQuery.data
  const chrono = chronoQuery.data

  // The join. Both lists hold the same titles in a different order, so a
  // position lookup each way is all it takes -- and the threads carry indices
  // only, with no colour and no watch state in them, so marking something
  // watched cannot invalidate a hundred and twenty-eight curves.
  const model = useMemo(() => {
    if (!release || !chrono) return null

    const releaseAt = new Map(release.map((movie, index) => [movie.id, index]))
    const chronoAt = new Map(chrono.map((movie, index) => [movie.id, index]))
    const byId = new Map(release.map((movie) => [movie.id, movie]))

    const links = []
    for (const [id, from] of releaseAt) {
      const to = chronoAt.get(id)
      if (to !== undefined) links.push({ id, from, to })
    }

    // The two trailing columns, built once with the rest of the model. The
    // running total in particular is a scan of the whole chronology, and
    // rebuilding it on every hover would be the one genuinely wasteful thing
    // on the page.
    const dates = release.map((movie) => formatDate(movie.release_date))
    const hours = runningTime(chrono)

    return {
      releaseAt,
      chronoAt,
      byId,
      links,
      dates,
      hours,
      floored: hours.some((total) => total.endsWith('+')),
    }
  }, [release, chrono])

  const activeId = hoverId ?? selectedId

  /** Light a title and bring it into view, wherever the page is scrolled. */
  function reveal(id) {
    setSelectedId(id)
    const row = pageRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`)
    row?.scrollIntoView?.({
      block: 'center',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
    return row
  }

  // Answer the header's search here rather than leaving the page: a title is
  // already on screen twice, and where those two places are is the question
  // this page exists for. Read through a ref so the claim is made once on
  // mount -- see `lib/searchTarget`, and the same pattern on the timeline.
  const findRef = useRef(null)
  useEffect(() => {
    findRef.current = {
      find(movie) {
        if (!model?.byId.has(movie.id)) return false
        // Nothing to show it on if both lines are down, so let the lens fall
        // back to opening the title's own page.
        if (!show.release && !show.chronological) return false
        reveal(movie.id)
        return true
      },
      refocus() {
        if (selectedId) reveal(selectedId)?.focus?.({ preventScroll: true })
      },
    }
  })
  useEffect(
    () =>
      claimSearch({
        find: (movie) => findRef.current?.find(movie) ?? false,
        refocus: () => findRef.current?.refocus(),
      }),
    [],
  )

  if (releaseQuery.error || chronoQuery.error) {
    const failed = releaseQuery.error ? releaseQuery : chronoQuery
    return <ErrorState error={failed.error} onRetry={failed.refetch} />
  }

  const both = show.release && show.chronological
  const drawLinks = both && show.links
  const height = model ? Math.max(release.length, chrono.length) * ROW : 0

  const activeMovie = activeId ? (model?.byId.get(activeId) ?? null) : null
  const activeColour = activeMovie
    ? isWatched(progress, activeMovie.id)
      ? 'var(--color-ok)'
      : accentFor(activeMovie)
    : 'transparent'

  // Two columns face each other across the band; one column faces right on its
  // own. The headings and the lists are laid on the same template, so a heading
  // always sits over its own spine.
  const grid = both
    ? 'grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-start sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]'
    : 'mx-auto grid max-w-md grid-cols-1 items-start'

  return (
    <div ref={pageRef}>
      <div className="pt-8 pb-5">
        <h1 className="display text-5xl text-balance text-ink sm:text-6xl">
          Release against chronology
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-dim">
          Every title in both orders at once. The thread between them is how far it moves: flat
          where the two agree, and steep where a film arrived years after the events it depicts.
          The release line is dated; the chronological one counts the hours as they add up.
        </p>
      </div>

      <div
        className="sticky z-10 border-y-2 border-ink bg-paper"
        style={{ top: headerHeight }}
      >
        <div className="flex items-center justify-between gap-3 py-2">
          {activeMovie && model ? (
            <Readout
              movie={activeMovie}
              releaseAt={model.releaseAt.get(activeMovie.id)}
              chronoAt={model.chronoAt.get(activeMovie.id)}
            />
          ) : (
            <p className="meta truncate text-ink-dim">
              Point at a title to trace it, click to keep it lit
            </p>
          )}

          <KeyMenu
            open={keyOpen}
            onToggle={() => setKeyOpen((value) => !value)}
            show={show}
            setShow={setShow}
            canLink={both}
            floored={Boolean(model?.floored)}
          />
        </div>

        {(show.release || show.chronological) && (
          <div className={`${grid} pb-1.5`}>
            {show.release && (
              <p className={`label text-ink ${both ? 'pr-3 text-right' : 'pl-3'}`}>
                Release order
              </p>
            )}
            {both && <span />}
            {show.chronological && <p className="label pl-3 text-ink">Chronological</p>}
          </div>
        )}
      </div>

      {(releaseQuery.isPending || chronoQuery.isPending) && (
        <LoadingState label="Loading both orders" />
      )}

      {!show.release && !show.chronological && (
        <EmptyState>Both lines are hidden. Turn one back on in the key.</EmptyState>
      )}

      {model && (show.release || show.chronological) && (
        <div className={grid}>
          {show.release && (
            <OrderColumn
              movies={release}
              row={ROW}
              spine={both ? 'right' : 'left'}
              progress={progress}
              aside={show.dates ? { width: 'w-[4.75rem]', values: model.dates } : null}
              activeId={activeId}
              selectedId={selectedId}
              onHover={setHoverId}
              onSelect={setSelectedId}
            />
          )}

          {both && (
            <div style={{ height }}>
              {drawLinks && (
                <ShiftLinks
                  links={model.links}
                  row={ROW}
                  height={height}
                  activeId={activeId}
                  activeColour={activeColour}
                />
              )}
            </div>
          )}

          {show.chronological && (
            <OrderColumn
              movies={chrono}
              row={ROW}
              spine="left"
              progress={progress}
              aside={show.runtime ? { width: 'w-12', values: model.hours } : null}
              activeId={activeId}
              selectedId={selectedId}
              onHover={setHoverId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      )}
    </div>
  )
}
