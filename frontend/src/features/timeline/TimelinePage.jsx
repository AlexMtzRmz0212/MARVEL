import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useEdges, useMovies } from '../../api/catalog'
import { CheckIcon } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { buildGraph, createSimulation, seedPositions } from '../../lib/forceGraph'
import { accentFor, formatRuntime, phaseLabel, year } from '../../lib/format'
import { isWatched, progressFor, toggleWatched } from '../../lib/watchStorage'
import { GraphCanvas } from './GraphCanvas'

/**
 * The whole catalog as one graph, given the page to itself.
 *
 * The layout argument is in `lib/forceGraph.js`: forces on the horizontal, a
 * hard constraint on the vertical, so the thing can be pushed around and still
 * never shows a prerequisite below something that needs it.
 *
 * Everything that is not the graph is one toolbar and one status line. An
 * earlier version of this page put the detail in a panel beside the diagram and
 * the diagram lost; here it gets the whole viewport — measured, not guessed —
 * and the words stay in a single row at the bottom.
 */

/** Clear of the bottom of the window, without summoning a scrollbar. */
const BREATHING_ROOM = 12

/** Zoomed in at least this far, there is room to show every label at once. */
const LABEL_ZOOM = 1.45

function Meta({ children }) {
  return <span className="meta hidden shrink-0 md:inline">{children}</span>
}

/**
 * One line saying what you are pointing at. Deliberately not a panel: the
 * counts and the specs complement the picture, they do not compete with it.
 */
function StatusStrip({ node, graph, chainOf, watched, onOpen }) {
  if (!node || !graph) {
    return (
      <p className="meta hairline flex h-11 shrink-0 items-center border-t px-4 sm:px-6">
        Point at a title, or press Tab to step into the graph
      </p>
    )
  }

  const runtime = formatRuntime(node.runtime_min)
  const needs = graph.preds.get(node.id)?.length ?? 0
  const unlocks = graph.succs.get(node.id)?.length ?? 0

  return (
    <div className="hairline flex h-11 shrink-0 items-center gap-x-4 border-t px-4 sm:px-6">
      <span
        aria-hidden="true"
        className="h-5 w-[3px] shrink-0"
        style={{ backgroundColor: watched ? 'var(--color-ok)' : accentFor(node) }}
      />
      <span
        className={[
          'min-w-0 truncate text-sm',
          watched ? 'text-ink-dim line-through decoration-ok/70' : 'text-ink',
        ].join(' ')}
      >
        {node.title}
      </span>

      <Meta>
        {year(node.release_date)} · {phaseLabel(node.phase)}
        {runtime && ` · ${runtime}`}
      </Meta>

      <span className="meta shrink-0 text-ink-dim">
        needs {needs} · unlocks {unlocks} · chain {chainOf(node.id).size}
      </span>
      <Meta>depth {node.depth + 1}</Meta>

      <button
        type="button"
        onClick={() => toggleWatched(node.id)}
        aria-pressed={watched}
        aria-label={watched ? `Mark ${node.title} unwatched` : `Mark ${node.title} watched`}
        className={[
          'ml-auto grid size-6 shrink-0 place-items-center border transition-colors',
          watched
            ? 'border-ok/60 bg-ok/20 text-ok'
            : 'border-hairline-strong text-ink-faint hover:border-ink-faint hover:text-ink',
        ].join(' ')}
      >
        <CheckIcon className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => onOpen(node.id)}
        className="meta shrink-0 border border-hairline-strong px-2.5 py-1 text-ink-dim transition-colors hover:text-ink"
      >
        Open
      </button>
    </div>
  )
}

/** Everything behind a title, however far back. Memoised per graph. */
function chainCounter(preds) {
  const cache = new Map()
  return function chainOf(id) {
    const hit = cache.get(id)
    if (hit) return hit

    const seen = new Set()
    const stack = [...(preds.get(id) ?? [])]
    while (stack.length > 0) {
      const next = stack.pop()
      if (next === id || seen.has(next)) continue
      seen.add(next)
      stack.push(...(preds.get(next) ?? []))
    }

    cache.set(id, seen)
    return seen
  }
}

export function TimelinePage() {
  const navigate = useNavigate()
  const progress = useWatchProgress()
  // Chronological rather than release: the curated chronology is a valid
  // topological sort of the edges, which both the reading order and the seeding
  // lean on. There is no order toggle because there would be nothing for it to
  // change — the graph is laid out by dependency depth, not by date.
  const moviesQuery = useMovies({ order: 'chronological' })
  const edgesQuery = useEdges()

  const [selectedId, setSelectedId] = useState(null)
  const [hoverId, setHoverId] = useState(null)
  const [centreOn, setCentreOn] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [height, setHeight] = useState(null)

  // Fill everything from here to the bottom of the window. Measured, because
  // the header is one row on a desktop and two on a phone, and any hard-coded
  // offset would be wrong on one of them.
  const pageRef = useRef(null)
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return

    const measure = () => {
      const top = page.getBoundingClientRect().top
      setHeight(Math.max(360, window.innerHeight - top - BREATHING_ROOM))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const movies = moviesQuery.data
  const edges = edgesQuery.data

  // Built once. The simulation owns the node objects and mutates them in place,
  // so rebuilding it on a re-render would throw the layout away mid-motion.
  const engine = useMemo(() => {
    if (!movies || !edges) return null
    const graph = buildGraph(movies, edges)
    seedPositions(graph)
    return { graph, simulation: createSimulation(graph) }
  }, [movies, edges])

  const chainOf = useMemo(() => (engine ? chainCounter(engine.graph.preds) : null), [engine])

  // Open on the first thing left to watch.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !engine) return
    started.current = true
    const resume = engine.graph.nodes.find((node) => !isWatched(progress, node.id))
    setSelectedId((resume ?? engine.graph.nodes[0])?.id ?? null)
  }, [engine, progress])

  if (moviesQuery.error || edgesQuery.error) {
    return (
      <ErrorState
        error={moviesQuery.error ?? edgesQuery.error}
        onRetry={moviesQuery.error ? moviesQuery.refetch : edgesQuery.refetch}
      />
    )
  }

  const graph = engine?.graph ?? null
  const activeId = hoverId ?? selectedId
  const active = graph?.nodes.find((node) => node.id === activeId) ?? null

  const related = new Set()
  if (graph && activeId) {
    for (const id of graph.preds.get(activeId) ?? []) related.add(id)
    for (const id of graph.succs.get(activeId) ?? []) related.add(id)
  }

  const overall = graph ? progressFor(progress, graph.order) : null
  const resume = graph?.nodes.find((node) => !isWatched(progress, node.id))

  function jump(id) {
    setSelectedId(id)
    setCentreOn({ id, at: Date.now() })
  }

  /** Arrow-key travel: along the catalog, or up and down the dependencies. */
  function step(id, direction) {
    if (!graph) return

    if (direction === 'needs' || direction === 'unlocks') {
      const next = (direction === 'needs' ? graph.preds : graph.succs).get(id)?.[0]
      if (next) jump(next)
      return
    }

    const next = graph.order[graph.order.indexOf(id) + direction]
    if (next) jump(next)
  }

  return (
    <div
      ref={pageRef}
      className="-mx-4 flex flex-col sm:-mx-6"
      style={height ? { height } : undefined}
    >
      <div className="hairline flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 sm:px-6">
        <h1 className="text-sm font-medium tracking-tight text-ink">Timeline</h1>
        <p className="meta hidden lg:inline">
          Every title, placed by what has to come first · drag one to push it about
        </p>

        {overall && (
          <span className="meta ml-auto shrink-0">
            {overall.watched}/{overall.total} watched
          </span>
        )}
        {resume && (
          <button
            type="button"
            onClick={() => jump(resume.id)}
            className="meta shrink-0 border border-hairline-strong px-2.5 py-1 text-ink-dim transition-colors hover:text-ink"
          >
            Next unwatched
          </button>
        )}
        <button
          type="button"
          onClick={() => setCentreOn({ id: 'fit', at: Date.now() })}
          className="meta shrink-0 border border-hairline-strong px-2.5 py-1 text-ink-dim transition-colors hover:text-ink"
        >
          Fit
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {engine ? (
          <GraphCanvas
            graph={engine.graph}
            simulation={engine.simulation}
            progress={progress}
            activeId={activeId}
            selectedId={selectedId}
            hovering={hoverId !== null}
            related={related}
            onSelect={setSelectedId}
            onHover={setHoverId}
            onOpen={(id) => navigate(`/movies/${id}`)}
            onStep={step}
            onToggleWatched={toggleWatched}
            centreOn={centreOn}
            showAllLabels={zoom >= LABEL_ZOOM}
            onZoom={setZoom}
          />
        ) : (
          <LoadingState label="Building the graph" />
        )}

        <p className="meta pointer-events-none absolute right-3 bottom-3 hidden text-right sm:block">
          scroll to zoom · drag to pan · double-click to fit
          <br />
          <Link to="/catalog" className="pointer-events-auto underline underline-offset-4">
            or browse the catalog
          </Link>
        </p>
      </div>

      <StatusStrip
        node={active}
        graph={graph}
        chainOf={chainOf}
        watched={active ? isWatched(progress, active.id) : false}
        onOpen={(id) => navigate(`/movies/${id}`)}
      />
    </div>
  )
}
