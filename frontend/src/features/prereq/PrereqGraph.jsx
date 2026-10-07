import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { LineBullet } from '../../components/LineBullet'
import { CheckIcon } from '../../components/WatchToggle'
import { layoutDag } from '../../lib/dagLayout'
import { accentFor, formatRuntime, phaseLabel, year } from '../../lib/format'

/**
 * Hand-rolled SVG rather than a graph library.
 *
 * These graphs are small (tens of nodes, depth under fifteen) and the server has
 * already done the layer assignment, so a library would add ~150kB to draw
 * rectangles and cubic curves. Nodes are `foreignObject` so they can be styled
 * with the same Tailwind classes as the rest of the app.
 *
 * Even laid out well, a graph this dense is read one thread at a time, so
 * hovering a title or a line isolates it: everything unrelated fades, and an
 * edge explains itself in a tooltip. The hit target for an edge is a fat
 * invisible copy of it — a 1px stroke is not something a pointer can catch.
 */

/** How far an unrelated node or edge fades while something else is hovered. */
const DIMMED = 0.12

function Node({ node, nodeWidth, nodeHeight, state, onEnter, onLeave }) {
  const runtime = formatRuntime(node.runtime_min)
  const details = [year(node.release_date), phaseLabel(node.phase), runtime].filter(Boolean)
  const recommended = node.strength === 'recommended' && !node.is_target

  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={nodeWidth}
      height={nodeHeight}
      opacity={state === 'dim' ? DIMMED : 1}
      style={{ transition: 'opacity 120ms' }}
    >
      <Link
        to={`/movies/${node.id}`}
        aria-label={node.watched ? `${node.title} (watched)` : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className={[
          // A station card. Recommended stops are cased in a dashed line, the
          // same convention as their edges, rather than faded.
          'group relative flex h-full items-center gap-2 overflow-hidden bg-surface px-2 py-1.5 transition-colors',
          node.is_target ? 'border-[3px] border-ink bg-raised' : 'border-2 border-ink hover:bg-raised',
          recommended ? 'border-dashed' : '',
          state === 'lit' ? 'bg-raised' : '',
        ].join(' ')}
      >
        <LineBullet movie={node} className="size-6 text-[11px]" />
        <span className="min-w-0 flex-1">
          <span
            className={[
              'line-clamp-2 text-xs leading-snug text-ink',
              node.is_target ? 'font-extrabold' : 'font-semibold',
            ].join(' ')}
          >
            {node.title}
          </span>
          <span className="meta mt-0.5 block truncate text-[11px]">{details.join(', ')}</span>
        </span>
        {node.watched && (
          <span
            aria-hidden="true"
            className="station grid size-5 shrink-0 place-items-center self-start bg-ok text-on-ok"
          >
            <CheckIcon className="size-3" />
          </span>
        )}
      </Link>
    </foreignObject>
  )
}

/** Roughly how tall the card gets, used only to decide which side to flip to. */
const TOOLTIP_HEIGHT = 110

function EdgeTooltip({ edge, titles, x, y, width }) {
  // The diagram scrolls, so a card that hangs off an edge gets clipped rather
  // than overflowing. Keep it inside on both axes.
  const clamped = Math.min(Math.max(x, 130), Math.max(width - 130, 130))
  const below = y < TOOLTIP_HEIGHT

  return (
    <div
      className={[
        'pointer-events-none absolute z-10 w-64 -translate-x-1/2',
        below ? '' : '-translate-y-full',
      ].join(' ')}
      style={{ left: clamped, top: below ? y + 22 : y - 22 }}
    >
      <div className={`floating bubble bubble-center px-3 py-2 ${below ? '' : 'bubble-below'}`}>
        <p className="meta">
          {edge.strength === 'essential' ? 'Required before' : 'Recommended before'}
        </p>
        <p className="mt-1 text-sm leading-snug font-semibold text-ink">
          <span className="text-ink-dim">{titles.get(edge.from) ?? edge.from}</span>
          <span aria-hidden="true" className="mx-1.5 text-ink-dim">
            &rarr;
          </span>
          {titles.get(edge.to) ?? edge.to}
        </p>
        {edge.note && <p className="mt-1.5 text-sm leading-snug text-ink-dim">{edge.note}</p>}
      </div>
    </div>
  )
}

export function PrereqGraph({ nodes, edges }) {
  const layout = useMemo(() => layoutDag(nodes, edges), [nodes, edges])
  const [hover, setHover] = useState(null)

  const titles = useMemo(() => new Map(nodes.map((node) => [node.id, node.title])), [nodes])
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  if (layout.nodes.length === 0) return null

  // What the current hover implies about everything else: an edge lights its two
  // endpoints, a node lights every edge it touches and whatever sits on the
  // other end of them.
  const litEdges = new Set()
  const litNodes = new Set()
  if (hover?.type === 'edge') {
    litEdges.add(hover.edge.id)
    litNodes.add(hover.edge.from)
    litNodes.add(hover.edge.to)
  } else if (hover?.type === 'node') {
    litNodes.add(hover.id)
    for (const path of layout.paths) {
      if (path.from !== hover.id && path.to !== hover.id) continue
      litEdges.add(path.id)
      litNodes.add(path.from)
      litNodes.add(path.to)
    }
  }

  const stateOf = (id, lit) => (!hover ? 'plain' : lit.has(id) ? 'lit' : 'dim')

  return (
    <div className="panel halftone overflow-x-auto">
      <div className="relative" style={{ width: layout.width }}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label="Prerequisite dependency graph"
          className="block max-w-none"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L7,4 L0,7 Z" fill="var(--color-ink)" />
            </marker>
          </defs>

          {/* Required links are drawn as transit lines: the colour of the
              title they lead into, cased in ink. Recommended ones are a thin
              dashed ink line, so strength is readable without hovering. All of
              it clears 3:1 against the page; only hovering something else dims
              it. Casings go down as one layer first so crossings stay clean. */}
          {['casing', 'colour'].map((layer) => (
            <g key={layer} fill="none" strokeLinecap="round">
              {layout.paths.map((path) => {
                const state = stateOf(path.id, litEdges)
                const essential = path.strength === 'essential'
                if (layer === 'colour' && !essential) return null
                const target = byId.get(path.to)
                const lit = state === 'lit'
                let width = lit ? 3.5 : 2.5
                if (layer === 'casing') width = essential ? (lit ? 7 : 5.5) : lit ? 2.25 : 1.5
                return (
                  <path
                    key={path.id}
                    d={path.d}
                    stroke={
                      layer === 'casing'
                        ? 'var(--color-ink)'
                        : target
                          ? accentFor(target)
                          : 'var(--color-adjacent)'
                    }
                    strokeWidth={width}
                    strokeDasharray={essential ? undefined : '4 3'}
                    markerEnd={layer === 'casing' ? 'url(#arrow)' : undefined}
                    opacity={state === 'dim' ? DIMMED : 1}
                    style={{ transition: 'opacity 120ms' }}
                  />
                )
              })}
            </g>
          ))}

          {/* Invisible fat copies of the curves: a 1px stroke is not a pointer
              target. Drawn under the nodes so a card always wins the hover. */}
          <g fill="none" stroke="transparent" strokeWidth="14">
            {layout.paths.map((path) => (
              <path
                key={path.id}
                d={path.d}
                style={{ pointerEvents: 'stroke' }}
                onMouseEnter={() => setHover({ type: 'edge', edge: path, x: path.labelX, y: path.labelY })}
                onMouseMove={(event) => {
                  const box = event.currentTarget.ownerSVGElement.getBoundingClientRect()
                  setHover({
                    type: 'edge',
                    edge: path,
                    x: event.clientX - box.left,
                    y: event.clientY - box.top,
                  })
                }}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>

          <g>
            {layout.nodes.map((node) => (
              <Node
                key={node.id}
                node={node}
                nodeWidth={layout.nodeWidth}
                nodeHeight={layout.nodeHeight}
                state={stateOf(node.id, litNodes)}
                onEnter={() => setHover({ type: 'node', id: node.id })}
                onLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>

        {hover?.type === 'edge' && (
          <EdgeTooltip
            edge={hover.edge}
            titles={titles}
            x={hover.x}
            y={hover.y}
            width={layout.width}
          />
        )}
      </div>
    </div>
  )
}

/** Below `md` the columns stop fitting, so the same data becomes an ordered list. */
export function PrereqChainList({ watchOrder, nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <ol className="panel divide-y divide-hairline">
      {watchOrder.map((id, index) => {
        const node = byId.get(id)
        if (!node) return null
        const recommended = node.strength === 'recommended' && !node.is_target
        return (
          <li key={id}>
            <Link
              to={`/movies/${id}`}
              aria-label={node.watched ? `${node.title} (watched)` : undefined}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-raised"
            >
              <span className="meta w-6 shrink-0 text-right text-sm">{index + 1}</span>
              <LineBullet movie={node} className="size-6 text-[11px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{node.title}</span>
                {recommended && <span className="meta block">Recommended</span>}
              </span>
              {node.watched && (
                <span
                  aria-hidden="true"
                  className="station grid size-5 shrink-0 place-items-center bg-ok text-on-ok"
                >
                  <CheckIcon className="size-3" />
                </span>
              )}
              <span className="meta shrink-0">{year(node.release_date)}</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
