import { Link } from 'react-router'

import { useEdges, useMovies } from '../../api/catalog'
import { LineBullet } from '../../components/LineBullet'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { progressFor } from '../../lib/watchStorage'
import { CatalogMark, OrderMark, ProgressMark, TimelineMark } from './FeatureMarks'
import { HeroGraph } from './HeroGraph'

/**
 * The front door.
 *
 * For most of this project the catalog was the front door, which was honest
 * but answered the wrong question: someone arriving cold does not want a wall
 * of 123 titles, they want to know what this is and whether it is for them.
 * Three answers, in this order, and nothing else on the page.
 *
 *   1. The claim, in seven words, next to a picture of it being true.
 *   2. Four numbers, so the size of the thing is not a matter of trust.
 *   3. The four places to go, each drawn rather than described.
 *
 * The picture is the argument: it is the real layout engine running over real
 * prerequisites (see `HeroGraph`), so what a visitor sees on the landing page
 * is what the app actually does, not an illustration commissioned to suggest
 * it. Everything else here is deliberately thin.
 */

const FEATURES = [
  {
    to: '/catalog',
    name: 'Catalog',
    line: 'Every film, series and special. Filter by phase, saga or medium.',
    Mark: CatalogMark,
  },
  {
    to: '/timeline',
    name: 'Timeline',
    line: 'The whole catalog as one map. Drag it about; nothing ever points backwards.',
    Mark: TimelineMark,
  },
  {
    to: '/orders',
    name: 'Your own order',
    line: 'Drag titles into the sequence you want. It flags whatever is out of place.',
    Mark: OrderMark,
  },
  {
    to: '/progress',
    name: 'Progress',
    line: 'What you have seen, broken down by phase, by saga and in hours.',
    Mark: ProgressMark,
  },
]

/**
 * The catalog panel shows the catalog: five real posters, one per stretch of
 * the timeline, each with its saga roundel. Until the catalog arrives -- or if
 * none of them has art -- it falls back to the drawn mark, at the same size.
 */
const SHELF = [
  'iron-man',
  'the-avengers',
  'avengers-endgame',
  'loki',
  'the-fantastic-four-first-steps',
]

function Shelf({ movies }) {
  const byId = new Map((movies ?? []).map((movie) => [movie.id, movie]))
  const shelf = SHELF.map((id) => byId.get(id)).filter((movie) => movie?.poster_url)
  if (shelf.length === 0) return <CatalogMark className="h-24 w-full lg:h-44" />

  return (
    <div className="grid grid-cols-5 gap-2" aria-hidden="true">
      {shelf.map((movie) => (
        <div key={movie.id} className="relative aspect-[2/3] border-2 border-ink bg-raised">
          <img
            src={movie.poster_url}
            alt=""
            width={500}
            height={750}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          <LineBullet movie={movie} className="absolute top-1.5 left-1.5 size-6" />
        </div>
      ))}
    </div>
  )
}

function Figure({ value, label, lead = false }) {
  return (
    <div className={`panel px-4 py-3 ${lead ? 'benday bg-infinity text-on-infinity' : ''}`}>
      <p className="display text-5xl normal-case tabular-nums sm:text-6xl">
        {value ?? (
          // Holds the line's height while the catalog loads, so nothing below
          // it jumps when the numbers arrive.
          <span className="inline-block h-[0.7em] w-16 animate-pulse bg-raised align-baseline" />
        )}
      </p>
      <p className={`mt-1 text-sm font-semibold ${lead ? '' : 'text-ink-dim'}`}>{label}</p>
    </div>
  )
}

/** A swatch of line, drawn the way the map draws it. */
function KeyLine({ colour, dashed, children }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 8" aria-hidden="true" className="h-2 w-6 shrink-0">
        {dashed ? (
          <line x1="2" y1="4" x2="22" y2="4" stroke="var(--color-ink)" strokeWidth="1.75" strokeDasharray="4 3" />
        ) : (
          <>
            <line x1="2" y1="4" x2="22" y2="4" stroke="var(--color-ink)" strokeWidth="7" strokeLinecap="round" />
            <line x1="2" y1="4" x2="22" y2="4" stroke={colour} strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span className="meta text-ink-dim">{children}</span>
    </span>
  )
}

export function HomePage() {
  // Same query key the catalog uses, so arriving here warms the page most
  // people click through to next.
  const moviesQuery = useMovies({ order: 'release' })
  const edgesQuery = useEdges()
  const progress = useWatchProgress()

  const movies = moviesQuery.data
  const edges = edgesQuery.data
  // The figures are the one part of this page that cannot be honest on its
  // own. If the catalog will not load, the row goes rather than pulsing at an
  // empty skeleton forever: the page still says what the app is.
  const counted = !moviesQuery.isError && !edgesQuery.isError

  const watched = movies ? progressFor(progress, movies.map((movie) => movie.id)) : null
  const hours = movies
    ? Math.round(movies.reduce((total, movie) => total + (movie.runtime_min ?? 0), 0) / 60)
    : null
  const phases = movies
    ? new Set(movies.map((movie) => movie.phase).filter(Boolean)).size
    : null

  return (
    <div className="pt-4 sm:pt-6">
      <section className="grid gap-3 lg:grid-cols-12">
        <div className="panel benday flex flex-col justify-center p-6 sm:p-8 lg:col-span-5">
          <h1 className="display text-5xl text-balance text-ink sm:text-6xl">
            What to watch, and what to watch first.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-dim">
            Every film, series and special, mapped by what you need to have seen first.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/catalog" className="btn btn-primary">
              Open the catalog
            </Link>
            <Link to="/timeline" className="btn">
              See the map
            </Link>
          </div>
          {/* Only for someone who has not started: the fastest way in for a
              person who has already seen half of it is to say so, quickly. */}
          {Object.keys(progress).length === 0 && (
            <p className="mt-5 text-sm text-ink-dim">
              Seen some already?{' '}
              <Link to="/progress/sort" className="font-semibold text-ink underline underline-offset-4">
                Swipe through them in a minute
              </Link>
            </p>
          )}
        </div>

        <div className="panel halftone flex flex-col lg:col-span-7">
          {/* The two aspects are the two shapes the excerpt actually settles
              into, measured rather than guessed: 0.675 turned vertically for
              the phone, 2.65 laid out flat for everything else. A frame much
              squarer than its drawing is mostly empty frame. */}
          <div className="flex flex-1 items-center p-2 sm:p-4">
            <div className="aspect-[27/40] w-full sm:aspect-[12/5]">
            <HeroGraph />
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-ink bg-surface px-4 py-2.5">
            <KeyLine colour="var(--color-infinity)">Infinity Saga</KeyLine>
            <KeyLine colour="var(--color-multiverse)">Multiverse Saga</KeyLine>
            <KeyLine dashed>Recommended first</KeyLine>
          </div>
        </div>
      </section>

      {counted && (
        <section className="mt-3">
          <h2 className="sr-only">The catalog in numbers</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure value={movies?.length} label="Titles" lead />
            <Figure value={edges?.length} label="Prerequisites" />
            <Figure value={phases} label="Phases" />
            {/* Someone who has watched nothing is told how much there is;
                someone who has started is told how far in they are. */}
            {watched?.watched ? (
              <Figure value={`${watched.percent}%`} label="Watched" />
            ) : (
              <Figure value={hours} label="Hours" />
            )}
          </div>
        </section>
      )}

      <section className="mt-3">
        <h2 className="sr-only">Where to go</h2>
        {/* A comic page rather than a row of equal cards: the catalog is where
            most people go, so it gets the big panel and the rest stack beside it. */}
        <div className="grid gap-3 lg:grid-cols-2 lg:grid-rows-3">
          {FEATURES.map((feature, index) => (
            <Link
              key={feature.to}
              to={feature.to}
              className={[
                'panel group flex gap-5 p-5 transition-colors hover:bg-raised',
                index === 0
                  ? 'flex-col justify-between lg:row-span-3 lg:p-8'
                  : 'flex-col sm:flex-row sm:items-center',
              ].join(' ')}
            >
              <div className={index === 0 ? 'lg:max-w-lg' : 'sm:w-40 sm:shrink-0'}>
                {index === 0 ? <Shelf movies={movies} /> : <feature.Mark />}
              </div>
              <div>
                <h3
                  className={`display text-ink ${index === 0 ? 'text-4xl lg:text-5xl' : 'text-3xl'}`}
                >
                  {feature.name}
                </h3>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-dim">
                  {feature.line}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* One line of colophon, because a portfolio piece should say what it
            is made of without turning the landing page into a CV. */}
        <p className="mt-6 text-sm text-ink-dim">
          React and FastAPI. Every watch order is a topological sort over the
          prerequisite graph.{' '}
          <a
            href="https://github.com/AlexMtzRmz0212/MARVEL"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink underline underline-offset-4 hover:decoration-2"
          >
            Source
          </a>
        </p>
      </section>
    </div>
  )
}
