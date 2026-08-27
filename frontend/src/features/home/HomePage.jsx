import { Link } from 'react-router'

import { useEdges, useMovies } from '../../api/catalog'
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

function Figure({ value, label }) {
  return (
    <div>
      <p className="font-mono text-3xl leading-none tabular-nums text-ink sm:text-4xl">
        {value ?? (
          // Holds the line's height while the catalog loads, so nothing below
          // it jumps when the numbers arrive.
          <span className="inline-block h-[0.7em] w-16 animate-pulse bg-raised align-baseline" />
        )}
      </p>
      <p className="meta mt-2">{label}</p>
    </div>
  )
}

function KeyDot({ colour, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="meta text-[0.625rem]">{children}</span>
    </span>
  )
}

function KeyLine({ dashed, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg viewBox="0 0 14 2" aria-hidden="true" className="h-0.5 w-3.5 shrink-0">
        <line
          x1="0"
          y1="1"
          x2="14"
          y2="1"
          stroke="var(--color-hairline-strong)"
          strokeWidth="2"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="meta text-[0.625rem]">{children}</span>
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
    <div>
      <section className="hairline grid items-center gap-10 border-b py-12 lg:grid-cols-12 lg:gap-12 lg:py-20">
        <div className="lg:col-span-5">
          <h1 className="text-3xl leading-[1.1] font-medium tracking-tight text-balance text-ink sm:text-4xl lg:text-5xl">
            What to watch, and what to watch first.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-dim sm:text-[0.9375rem]">
            Every film, series and special, mapped by what you need to have seen first.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link
              to="/catalog"
              className="meta bg-ink px-5 py-2.5 text-base transition-opacity hover:opacity-85"
            >
              Open the catalog
            </Link>
            <Link
              to="/timeline"
              className="meta border border-hairline-strong px-5 py-2.5 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
            >
              See the map
            </Link>
          </div>
        </div>

        <div className="lg:col-span-7">
          {/* The two aspects are the two shapes the excerpt actually settles
              into, measured rather than guessed: 0.675 turned vertically for
              the phone, 2.65 laid out flat for everything else. A frame much
              squarer than its drawing is mostly empty frame. */}
          <div className="hairline border bg-surface p-2 sm:p-3">
            <div className="aspect-[27/40] bg-base sm:aspect-[12/5]">
              <HeroGraph />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pt-3">
              <KeyDot colour="var(--color-infinity)">Infinity Saga</KeyDot>
              <KeyDot colour="var(--color-multiverse)">Multiverse Saga</KeyDot>
              <KeyLine>Required</KeyLine>
              <KeyLine dashed>Recommended</KeyLine>
            </div>
          </div>
        </div>
      </section>

      {counted && (
        <section className="hairline border-b py-10">
          <h2 className="sr-only">The catalog in numbers</h2>
          <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4">
            <Figure value={movies?.length} label="Titles" />
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

      <section className="py-10">
        <h2 className="sr-only">Where to go</h2>
        <div className="hairline grid gap-px border bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Link
              key={feature.to}
              to={feature.to}
              className="group flex flex-col gap-5 bg-base p-5 transition-colors hover:bg-surface"
            >
              <feature.Mark />
              <div>
                <h3 className="text-sm text-ink">
                  {feature.name}
                  <span
                    aria-hidden="true"
                    className="ml-1.5 inline-block text-ink-faint transition-transform group-hover:translate-x-0.5"
                  >
                    &rarr;
                  </span>
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{feature.line}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* One line of colophon, because a portfolio piece should say what it
            is made of without turning the landing page into a CV. */}
        <p className="mt-6 text-xs text-ink-faint">
          React and FastAPI. Every watch order is a topological sort over the
          prerequisite graph.{' '}
          <a
            href="https://github.com/AlexMtzRmz0212/MARVEL"
            target="_blank"
            rel="noreferrer"
            className="text-ink-dim underline underline-offset-4 transition-colors hover:text-ink"
          >
            Source
          </a>
        </p>
      </section>
    </div>
  )
}
