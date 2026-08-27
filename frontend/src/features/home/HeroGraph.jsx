import { useEffect, useMemo, useRef, useState } from 'react'

import { boundsOf, buildGraph, createSimulation, seedPositions } from '../../lib/forceGraph'
import { accentFor } from '../../lib/format'

/**
 * The landing page's one picture: a slice of the real map, drawn by the real
 * engine.
 *
 * It would have been easier to arrange some dots in a vector editor and ship
 * the SVG. This runs `lib/forceGraph` instead, over nineteen genuine titles and
 * the genuine prerequisites between them, because the claim the page is making
 * is that the catalog has a shape and this app knows it. A drawing of that
 * claim would be a picture of a promise. This is the thing itself, at a sixth
 * of the size.
 *
 * Nineteen nodes settle in single-digit milliseconds, so the layout is solved
 * twice on mount: once to find where it ends up, which fixes the frame, and
 * then again from the top, so the reader watches the map organise itself inside
 * that frame rather than watching the frame chase it.
 */

/**
 * The excerpt: the Infinity Saga's spine, the branch that turns into the
 * Multiverse Saga, and nothing invented. Every edge below appears in the seed
 * catalog exactly as it appears here.
 *
 * Picked to be the shape of the argument as much as a sample of it. Six titles
 * with nothing behind them, a middle that keeps splitting, a pinch at Infinity
 * War where all of it converges, and two series hanging off Endgame in the next
 * saga's colour.
 *
 * `compact` marks the nine that stay on a phone. Ten dependency depths drawn
 * across a 320px screen is a row of specks, so the narrow layout keeps the last
 * third of the excerpt instead: the same funnel and the same two colours, four
 * levels deep rather than ten. Dropping a title drops its edges with it, since
 * `buildGraph` only keeps edges between titles it was given.
 */
const TITLES = [
  { id: 'iron-man', title: 'Iron Man', mark: 'Iron Man' },
  { id: 'captain-america-the-first-avenger', title: 'Captain America' },
  { id: 'thor', title: 'Thor' },
  { id: 'the-incredible-hulk', title: 'The Incredible Hulk', tier: 'supporting' },
  { id: 'doctor-strange', title: 'Doctor Strange', compact: true },
  { id: 'captain-marvel', title: 'Captain Marvel', compact: true },
  { id: 'iron-man-2', title: 'Iron Man 2' },
  { id: 'the-avengers', title: 'The Avengers', mark: 'The Avengers' },
  { id: 'captain-america-the-winter-soldier', title: 'The Winter Soldier' },
  { id: 'thor-the-dark-world', title: 'The Dark World', tier: 'supporting' },
  { id: 'avengers-age-of-ultron', title: 'Age of Ultron' },
  { id: 'captain-america-civil-war', title: 'Civil War', mark: 'Civil War' },
  { id: 'black-panther', title: 'Black Panther', compact: true },
  { id: 'spider-man-homecoming', title: 'Homecoming', compact: true },
  { id: 'thor-ragnarok', title: 'Ragnarok', compact: true },
  { id: 'avengers-infinity-war', title: 'Infinity War', compact: true },
  { id: 'avengers-endgame', title: 'Endgame', mark: 'Endgame', compact: true },
  {
    id: 'wandavision',
    title: 'WandaVision',
    saga: 'Multiverse Saga',
    mark: 'WandaVision',
    compact: true,
  },
  { id: 'loki', title: 'Loki', saga: 'Multiverse Saga', mark: 'Loki', compact: true },
]

const EDGES = [
  ['iron-man', 'iron-man-2'],
  ['iron-man-2', 'the-avengers'],
  ['thor', 'the-avengers'],
  ['captain-america-the-first-avenger', 'the-avengers'],
  ['the-incredible-hulk', 'the-avengers', 'recommended'],
  ['the-avengers', 'captain-america-the-winter-soldier'],
  ['the-avengers', 'thor-the-dark-world'],
  ['captain-america-the-winter-soldier', 'avengers-age-of-ultron'],
  ['avengers-age-of-ultron', 'captain-america-civil-war'],
  ['captain-america-civil-war', 'black-panther'],
  ['captain-america-civil-war', 'spider-man-homecoming'],
  ['thor-the-dark-world', 'thor-ragnarok'],
  ['avengers-age-of-ultron', 'thor-ragnarok'],
  ['doctor-strange', 'thor-ragnarok', 'recommended'],
  ['thor-ragnarok', 'avengers-infinity-war'],
  ['black-panther', 'avengers-infinity-war'],
  ['doctor-strange', 'avengers-infinity-war'],
  ['spider-man-homecoming', 'avengers-infinity-war'],
  ['avengers-infinity-war', 'avengers-endgame'],
  ['captain-marvel', 'avengers-endgame'],
  ['avengers-endgame', 'wandavision'],
  ['avengers-endgame', 'loki'],
]

const MOVIES = TITLES.map((title) => ({ saga: 'Infinity Saga', tier: 'core', ...title }))
const LINKS = EDGES.map(([from, to, strength = 'essential']) => ({ from, to, strength }))

/**
 * Matches the graph page: hubs are bigger, square-rooted so none can dominate.
 *
 * `scale` is what keeps the phone drawing from looking cramped. Everything drawn
 * on top of the layout -- dots, type, strokes -- is sized in user units, and the
 * narrow excerpt's frame is about a quarter the width of the wide one while both
 * are shown at roughly the same physical size. A unit is therefore close to twice
 * as many pixels on a phone, so identical numbers came out twice as large there:
 * 20px labels over 16px dots, with "WandaVision" and "Loki" overprinting each
 * other. Halving them puts every ornament within a pixel of its desktop size.
 */
function radiusOf(node, scale) {
  return (5 + Math.min(Math.sqrt(node.degree) * 2.2, 7)) * scale
}

/**
 * Is there room for the wide layout?
 *
 * The engine takes the depth axis as a setting because the right answer depends
 * on the screen rather than on taste: an excerpt ten depths long draws a ribbon,
 * and a ribbon should lie along the longer side of whatever it is shown in.
 * Left to right on a desktop, top to bottom on a phone, which is the direction
 * a phone is being read in anyway.
 */
function useWideLayout() {
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}

export function HeroGraph({ className = '' }) {
  const wide = useWideLayout()
  const nodeRefs = useRef(new Map())
  const linkRefs = useRef(new Map())
  const frame = useRef(0)

  // Solved on the way in, so the frame is known before a pixel is drawn.
  const { graph, simulation, view, still, scale } = useMemo(() => {
    const built = buildGraph(
      wide ? MOVIES : MOVIES.filter((movie) => movie.compact),
      LINKS,
    )
    // The narrow layout is shorter as well as turned: fewer titles per band
    // means the bands can sit closer together without the labels touching.
    const options = { depthAxis: wide ? 'x' : 'y', levelGap: wide ? 104 : 78 }
    const scale = wide ? 1 : 0.5

    seedPositions(built, options)
    const engine = createSimulation(built, options)
    engine.settle(600)
    // `boundsOf` measures dot centres, so the margin is also the room the labels
    // hang in: 52 because "WandaVision" reaches ~50 units either side of its own
    // dot and at 46 the wide layout clipped its last letter against the frame.
    // The narrow margin is halved with everything else it has to clear.
    const box = boundsOf(built.nodes, wide ? 52 : 26)

    // Someone who has asked for less motion gets the settled layout as a still.
    // Everyone else gets it assembled in front of them, from the same starting
    // positions the engine always uses.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!reduced) {
      seedPositions(built, options)
      engine.reheat(1)
    }

    return { graph: built, simulation: engine, view: box, still: reduced, scale }
  }, [wide])

  useEffect(() => {
    const { nodes, links } = graph

    const paint = () => {
      for (const node of nodes) {
        nodeRefs.current.get(node.id)?.setAttribute('transform', `translate(${node.x} ${node.y})`)
      }
      for (const link of links) {
        const line = linkRefs.current.get(link.id)
        if (!line) continue
        const from = nodes[link.source]
        const to = nodes[link.target]
        line.setAttribute('x1', from.x)
        line.setAttribute('y1', from.y)
        line.setAttribute('x2', to.x)
        line.setAttribute('y2', to.y)
      }
    }

    paint()
    if (still) return undefined

    const step = () => {
      const alpha = simulation.tick()
      paint()
      if (alpha > 0.0021) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [graph, simulation, still])

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={`size-full ${className}`}
      role="img"
      aria-label="A map of Marvel titles. Lines run from each title to the ones that need it watched first: several starting points fan out, converge on Avengers: Endgame, and branch again into WandaVision and Loki."
    >
      <g fill="none" stroke="var(--color-hairline-strong)">
        {graph.links.map((link) => (
          <line
            key={link.id}
            ref={(element) => {
              if (element) linkRefs.current.set(link.id, element)
              else linkRefs.current.delete(link.id)
            }}
            strokeWidth={(link.strength === 'essential' ? 1.4 : 1) * scale}
            // Dashed means recommended rather than required, the convention
            // every other graph in the app uses.
            strokeDasharray={
              link.strength === 'essential' ? undefined : `${4 * scale} ${4 * scale}`
            }
            opacity={link.strength === 'essential' ? 0.75 : 0.4}
          />
        ))}
      </g>

      {graph.nodes.map((node) => (
        <g
          key={node.id}
          ref={(element) => {
            if (element) nodeRefs.current.set(node.id, element)
            else nodeRefs.current.delete(node.id)
          }}
        >
          <circle
            r={radiusOf(node, scale)}
            fill={accentFor(node)}
            stroke="var(--color-base)"
            strokeWidth={1.5 * scale}
          />
          {node.mark && (
            <text
              y={radiusOf(node, scale) + 15 * scale}
              textAnchor="middle"
              className="font-mono"
              fontSize={15 * scale}
              fill="var(--color-ink-dim)"
            >
              {node.mark}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
