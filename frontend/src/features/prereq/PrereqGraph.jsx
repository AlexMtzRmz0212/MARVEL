import { useMemo } from 'react'
import { Link } from 'react-router'

import { layoutDag } from '../../lib/dagLayout'
import { accentFor, formatRuntime, phaseLabel, year } from '../../lib/format'

/**
 * Hand-rolled SVG rather than a graph library.
 *
 * These graphs are small (tens of nodes, depth under ten) and the server has
 * already done the layer assignment, so a library would add ~150kB to draw
 * rectangles and cubic curves. Nodes are `foreignObject` so they can be styled
 * with the same Tailwind classes as the rest of the app.
 */
function Node({ node, nodeWidth, nodeHeight }) {
  const accent = accentFor(node)
  const runtime = formatRuntime(node.runtime_min)

  return (
    <foreignObject x={node.x} y={node.y} width={nodeWidth} height={nodeHeight}>
      <Link
        to={`/movies/${node.id}`}
        className={[
          'group relative flex h-full flex-col justify-center gap-1 overflow-hidden border bg-surface px-3 py-2 transition-colors',
          node.is_target
            ? 'border-hairline-strong bg-raised'
            : 'border-hairline hover:border-hairline-strong hover:bg-raised',
          node.strength === 'recommended' && !node.is_target ? 'opacity-70' : '',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0"
          style={{ width: node.is_target ? 3 : 2, backgroundColor: accent }}
        />
        <p
          className={[
            'line-clamp-2 text-xs leading-snug',
            node.is_target ? 'font-semibold text-ink' : 'text-ink',
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

export function PrereqGraph({ nodes, edges }) {
  const layout = useMemo(() => layoutDag(nodes, edges), [nodes, edges])

  if (layout.nodes.length === 0) return null

  return (
    <div className="hairline overflow-x-auto border bg-base">
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
        </defs>

        <g>
          {layout.paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill="none"
              stroke="var(--color-hairline-strong)"
              strokeWidth={path.strength === 'essential' ? 1.5 : 1}
              // Dashed means the link is recommended rather than required, so
              // strength is readable without hovering anything.
              strokeDasharray={path.strength === 'essential' ? undefined : '3 3'}
              markerEnd="url(#arrow)"
              opacity={path.strength === 'essential' ? 0.9 : 0.5}
            >
              {path.note && <title>{path.note}</title>}
            </path>
          ))}
        </g>

        <g>
          {layout.nodes.map((node) => (
            <Node
              key={node.id}
              node={node}
              nodeWidth={layout.nodeWidth}
              nodeHeight={layout.nodeHeight}
            />
          ))}
        </g>
      </svg>
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
              className="hairline flex items-center gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-surface"
            >
              <span className="meta w-6 shrink-0 tabular-nums">{index + 1}</span>
              <span
                aria-hidden="true"
                className="h-6 w-[2px] shrink-0"
                style={{
                  backgroundColor: node.strength === 'essential' ? accent : 'transparent',
                  outline: node.strength === 'essential' ? 'none' : `1px solid ${accent}`,
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{node.title}</span>
              <span className="meta shrink-0">{year(node.release_date)}</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
