import { useMemo, useState } from 'react'
import { Link } from 'react-router'

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
  const accent = accentFor(node)
  const runtime = formatRuntime(node.runtime_min)

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
          'group relative flex h-full flex-col justify-center gap-1 overflow-hidden border bg-surface px-3 py-2 transition-colors',
          node.is_target
            ? 'border-hairline-strong bg-raised'
            : 'border-hairline hover:border-hairline-strong hover:bg-raised',
          node.strength === 'recommended' && !node.is_target ? 'opacity-70' : '',
          state === 'lit' ? 'border-hairline-strong bg-raised' : '',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0"
          style={{
            width: node.is_target ? 3 : 2,
            backgroundColor: node.watched ? 'var(--color-ok)' : accent,
          }}
        />
        {node.watched && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid size-4 place-items-center border border-ok/60 bg-ok/20 text-ok"
          >
            <CheckIcon className="size-2.5" />
          </span>
        )}
        <p
          className={[
            'line-clamp-2 text-xs leading-snug',
            node.is_target ? 'font-semibold text-ink' : 'text-ink',
            node.watched ? 'pr-4 text-ink-dim line-through decoration-ok/70' : '',
          ].join(' ')}
        >
          {node.title}
        </p>
        <p className="meta flex items-center gap-1.5 text-[10px]">
          <span>{year(node.release_date)}</span>
          <span aria-hidden="true">·</span>
          <span>{phaseLabel(node.phase)}</span>
          {runtime && (
            <>
              <span aria-hidden="true">·</span>
              <span>{runtime}</span>
            </>
          )}
        </p>
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
      style={{ left: clamped, top: below ? y + 14 : y - 14 }}
    >
      <div className="hairline border bg-raised px-3 py-2 shadow-lg">
        <p className="meta text-[10px]">
          {edge.strength === 'essential' ? 'Required before' : 'Recommended before'}
        </p>
        <p className="mt-1 text-xs leading-snug text-ink">
          <span className="text-ink-dim">{titles.get(edge.from) ?? edge.from}</span>
          <span aria-hidden="true" className="mx-1.5 text-ink-faint">
            &rarr;
          </span>
          {titles.get(edge.to) ?? edge.to}
        </p>
        {edge.note && <p className="mt-1.5 text-xs leading-snug text-ink-dim">{edge.note}</p>}
      </div>
    </div>
  )
}

export function PrereqGraph({ nodes, edges }) {
  const layout = useMemo(() => layoutDag(nodes, edges), [nodes, edges])
  const [hover, setHover] = useState(null)

  const titles = useMemo(() => new Map(nodes.map((node) => [node.id, node.title])), [nodes])

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
    <div className="hairline overflow-x-auto border bg-base">
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
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L7,4 L0,7 Z" fill="var(--color-hairline-strong)" />
            </marker>
            <marker
              id="arrow-lit"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L7,4 L0,7 Z" fill="var(--color-ink)" />
            </marker>
          </defs>

          <g>
            {layout.paths.map((path) => {
              const state = stateOf(path.id, litEdges)
              const essential = path.strength === 'essential'
              return (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  stroke={state === 'lit' ? 'var(--color-ink)' : 'var(--color-hairline-strong)'}
                  strokeWidth={state === 'lit' ? 2 : essential ? 1.5 : 1}
                  // Dashed means the link is recommended rather than required, so
                  // strength is readable without hovering anything.
                  strokeDasharray={essential ? undefined : '3 3'}
                  markerEnd={state === 'lit' ? 'url(#arrow-lit)' : 'url(#arrow)'}
                  opacity={state === 'dim' ? DIMMED : state === 'lit' ? 1 : essential ? 0.9 : 0.5}
                  style={{ transition: 'opacity 120ms' }}
                />
              )
            })}
          </g>

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
    <ol className="hairline border">
      {watchOrder.map((id, index) => {
        const node = byId.get(id)
        if (!node) return null
        const accent = accentFor(node)
        return (
          <li key={id}>
            <Link
              to={`/movies/${id}`}
              aria-label={node.watched ? `${node.title} (watched)` : undefined}
              className="hairline flex items-center gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface"
            >
              <span className="meta w-6 shrink-0 tabular-nums">{index + 1}</span>
              <span
                aria-hidden="true"
                className="h-6 w-[2px] shrink-0"
                style={{
                  backgroundColor: node.watched
                    ? 'var(--color-ok)'
                    : node.strength === 'essential'
                      ? accent
                      : 'transparent',
                  outline:
                    node.strength === 'essential' || node.watched ? 'none' : `1px solid ${accent}`,
                }}
              />
              {node.watched && <CheckIcon className="size-3.5 shrink-0 text-ok" />}
              <span
                className={[
                  'min-w-0 flex-1 truncate text-sm',
                  node.watched ? 'text-ink-faint line-through decoration-ok/70' : 'text-ink',
                ].join(' ')}
              >
                {node.title}
              </span>
              <span className="meta shrink-0">{year(node.release_date)}</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
