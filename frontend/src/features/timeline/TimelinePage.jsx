import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useEdges, useMovies } from '../../api/catalog'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { buildGraph, createSimulation, seedPositions } from '../../lib/forceGraph'
import { isWatched, progressFor, toggleWatched } from '../../lib/watchStorage'
import { GraphCanvas } from './GraphCanvas'

/**
 * The whole catalog as one graph, given the page to itself.
 *
 * The layout argument is in `lib/forceGraph.js`: forces across, a hard
 * constraint along, so the thing can be pushed around and still never shows a
 * prerequisite after something that needs it.
 *
 * Nothing here scrolls, and nothing here is furniture. The page measures the
 * space between the header and the footer and takes exactly that; the canvas
 * refits itself into it; the controls and the colour key float in the corners.
 * There is no panel and no status line, because two earlier versions of this
 * page had one and in both of them the graph came second to it. What a title is
 * called is on the title.
 */

/** Zoomed in at least this far, there is room to show every label at once. */
const LABEL_ZOOM = 1.45

/**
 * What the colours mean.
 *
 * Saga is the colour axis everywhere in the app — cards, the prerequisite
 * graph, progress — so this key is really the app's, and the graph is just the
 * first place dense enough to need it spelled out.
 */
const KEY = [
  { label: 'Infinity Saga', colour: 'var(--color-infinity)' },
  { label: 'Multiverse Saga', colour: 'var(--color-multiverse)' },
  { label: 'Other / adjacent', colour: 'var(--color-adjacent)' },
  { label: 'Watched', colour: 'var(--color-ok)' },
]

function Control({ children, onClick, title, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'meta border bg-base/80 px-2 py-0.5 text-[0.625rem] backdrop-blur transition-colors',
        active
          ? 'border-hairline-strong text-ink'
          : 'border-hairline-strong text-ink-dim hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Every title reachable by walking prerequisites and unlocks outward, however
 *  far — the "whole tree" the connections toggle switches on. */
function reachable(graph, id) {
  const seen = new Set()
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.pop()
    const neighbours = [...(graph.preds.get(current) ?? []), ...(graph.succs.get(current) ?? [])]
    for (const next of neighbours) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

/** What the colours mean, and nothing else. */
function Legend({ open, onToggle }) {
  return (
    <div className="absolute bottom-3 left-3">
      {open && (
        <ul className="hairline mb-1.5 border bg-base/85 px-2.5 py-2 backdrop-blur">
          {KEY.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2 py-0.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.colour }}
              />
              <span className="meta text-[0.625rem]">{entry.label}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="meta border border-hairline-strong bg-base/80 px-2 py-0.5 text-[0.625rem] text-ink-dim backdrop-blur transition-colors hover:text-ink"
      >
        {open ? 'Hide key' : 'Key'}
      </button>
    </div>
  )
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
  const [command, setCommand] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [height, setHeight] = useState(null)
  const [legendOpen, setLegendOpen] = useState(false)
  // Off by default: a click gives just the immediate prerequisites and
  // unlocks, which is what most hovers are for. The toggle is for tracing a
  // title's whole reach through the catalog.
  const [deepConnections, setDeepConnections] = useState(false)
  // Held here rather than in the canvas because Reset is here: the button and
  // the state it clears belong together.
  const [pinned, setPinned] = useState(() => new Set())

  // Take exactly the space between the header and the footer, so the document
  // itself never scrolls. Both are measured rather than assumed: the header is
  // one row on a desktop and two on a phone.
  //
  // Not from `scrollHeight`, which cannot answer this. The shell is
  // `min-h-dvh` with a `flex-1` main, so the document is always *exactly* the
  // viewport height whatever this page does — shrink the page and the slack
  // simply reappears inside main. Asking it how much room is left below always
  // says "all of it", and the page collapses to its floor.
  //
  // Neither of the two measurements depends on the height being set: this page
  // is the first thing in main, and the footer is sized by its own content. So
  // one pass settles it.
  const pageRef = useRef(null)
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return

    const measure = () => {
      const above = page.getBoundingClientRect().top + window.scrollY
      const footer = page.ownerDocument.querySelector('footer')
      const below = footer?.getBoundingClientRect().height ?? 0
      setHeight(Math.max(320, window.innerHeight - above - below))
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
  // Both stay lit together: a hover adds its own connections rather than
  // replacing whatever the selection was already showing.
  const activeIds = new Set([selectedId, hoverId].filter(Boolean))

  const related = new Set()
  if (graph) {
    for (const id of activeIds) {
      if (deepConnections) {
        for (const id2 of reachable(graph, id)) related.add(id2)
      } else {
        for (const id2 of graph.preds.get(id) ?? []) related.add(id2)
        for (const id2 of graph.succs.get(id) ?? []) related.add(id2)
      }
    }
  }

  const overall = graph ? progressFor(progress, graph.order) : null

  function jump(id) {
    setSelectedId(id)
    setCommand({ kind: 'centre', id, at: Date.now() })
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
      // `-mb-24` cancels the shell's bottom padding, which on this one page is
      // space the graph should have instead.
      className="-mx-4 -mb-24 flex flex-col sm:-mx-6"
      style={height ? { height } : undefined}
    >
      <h1 className="sr-only">Timeline</h1>

      <div className="hairline relative min-h-0 flex-1 border-y">
        {engine ? (
          <GraphCanvas
            graph={engine.graph}
            simulation={engine.simulation}
            progress={progress}
            activeIds={activeIds}
            selectedId={selectedId}
            hovering={hoverId !== null}
            related={related}
            onSelect={setSelectedId}
            onHover={setHoverId}
            onOpen={(id) => navigate(`/movies/${id}`)}
            onStep={step}
            onToggleWatched={toggleWatched}
            pinned={pinned}
            onPinned={setPinned}
            command={command}
            showAllLabels={zoom >= LABEL_ZOOM}
            onZoom={setZoom}
          />
        ) : (
          <LoadingState label="Building the graph" />
        )}

        {/* Over the graph rather than above it: a toolbar row would cost the
            canvas its height, and there are only three controls. */}
        <div className="pointer-events-none absolute top-3 right-3 flex flex-wrap items-center justify-end gap-1.5">
          {overall && (
            <span className="meta pointer-events-auto px-1 text-[0.625rem]">
              {overall.watched}/{overall.total} watched
            </span>
          )}
          <div className="pointer-events-auto flex gap-1.5">
            <Control
              active={deepConnections}
              onClick={() => setDeepConnections((value) => !value)}
              title={
                deepConnections
                  ? 'Showing the whole tree of connections — click for just the direct ones'
                  : 'Showing direct connections only — click for the whole tree'
              }
            >
              {deepConnections ? 'Whole tree' : 'Direct only'}
            </Control>
            <Control
              onClick={() => {
                engine?.simulation.release()
                setPinned(new Set())
                setCommand({ kind: 'reset', at: Date.now() })
              }}
              title="Let go of everything placed by hand and settle again"
            >
              Reset
            </Control>
            <Control onClick={() => setCommand({ kind: 'fit', at: Date.now() })} title="Fit to view">
              Fit
            </Control>
          </div>
        </div>

        <Legend open={legendOpen} onToggle={() => setLegendOpen((value) => !value)} />
      </div>

    </div>
  )
}
