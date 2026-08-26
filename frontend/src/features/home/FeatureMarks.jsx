/**
 * Four small drawings, one per thing the app does.
 *
 * Each one is a reduction of the view it stands for rather than an icon of it:
 * the catalog's cards with their saga stripe, the graph's bands, a draft order
 * with a line flagged in it, the progress bars. Same shapes, same colours, one
 * sixth of the size, which is why none of them needs a caption to explain what
 * you are looking at.
 *
 * All decorative: the heading and the line beneath each card say the same
 * thing in words, so these are hidden from assistive tech rather than
 * described twice.
 */

const INFINITY = 'var(--color-infinity)'
const MULTIVERSE = 'var(--color-multiverse)'
const ADJACENT = 'var(--color-adjacent)'

function Mark({ children }) {
  return (
    <svg viewBox="0 0 160 72" aria-hidden="true" className="h-16 w-full" fill="none">
      {children}
    </svg>
  )
}

/** The catalog: cards in a row, each with its saga stripe, one already seen. */
export function CatalogMark() {
  const cards = [
    { accent: INFINITY },
    { accent: INFINITY, watched: true },
    { accent: MULTIVERSE },
    { accent: ADJACENT },
    { accent: MULTIVERSE },
  ]

  return (
    <Mark>
      {cards.map((card, index) => {
        const x = 8 + index * 30
        return (
          <g key={x} opacity={card.watched ? 0.45 : 1}>
            <rect
              x={x}
              y="12"
              width="24"
              height="48"
              fill="var(--color-raised)"
              stroke="var(--color-hairline)"
            />
            <rect x={x} y="12" width="2" height="48" fill={card.accent} />
            {card.watched && <circle cx={x + 18} cy="18" r="2.5" fill="var(--color-ok)" />}
          </g>
        )
      })}
    </Mark>
  )
}

/** The timeline: dependency depth left to right, one dashed suggestion in it. */
export function TimelineMark() {
  const nodes = {
    a1: [18, 20, INFINITY],
    a2: [18, 52, INFINITY],
    b1: [62, 12, INFINITY],
    b2: [62, 36, INFINITY],
    b3: [62, 60, INFINITY],
    c1: [106, 22, INFINITY],
    c2: [106, 50, MULTIVERSE],
    d1: [146, 36, MULTIVERSE],
  }
  const edges = [
    ['a1', 'b1'],
    ['a1', 'b2'],
    ['a2', 'b2', true],
    ['a2', 'b3'],
    ['b1', 'c1'],
    ['b2', 'c1'],
    ['b3', 'c2'],
    ['c1', 'd1'],
    ['c2', 'd1'],
  ]

  return (
    <Mark>
      <g stroke="var(--color-hairline-strong)">
        {edges.map(([from, to, dashed]) => (
          <line
            key={`${from}${to}`}
            x1={nodes[from][0]}
            y1={nodes[from][1]}
            x2={nodes[to][0]}
            y2={nodes[to][1]}
            strokeWidth={dashed ? 1 : 1.3}
            strokeDasharray={dashed ? '3 3' : undefined}
            opacity={dashed ? 0.5 : 0.85}
          />
        ))}
      </g>
      {Object.entries(nodes).map(([key, [cx, cy, fill]]) => (
        <circle key={key} cx={cx} cy={cy} r="4.5" fill={fill} />
      ))}
    </Mark>
  )
}

/** A draft order: rows in hand-picked sequence, with one of them out of order. */
export function OrderMark() {
  return (
    <Mark>
      {[8, 28, 48].map((y, index) => {
        const flagged = index === 1
        return (
          <g key={y}>
            <rect
              x="8"
              y={y}
              width="144"
              height="16"
              fill="var(--color-raised)"
              stroke="var(--color-hairline)"
            />
            <rect x="8" y={y} width="2" height="16" fill={flagged ? 'var(--color-danger)' : ADJACENT} />
            <circle cx="18" cy={y + 5.5} r="1.2" fill="var(--color-ink-faint)" />
            <circle cx="18" cy={y + 10.5} r="1.2" fill="var(--color-ink-faint)" />
            <rect
              x="26"
              y={y + 6.5}
              width={flagged ? 58 : 76}
              height="3"
              fill="var(--color-ink-dim)"
              opacity="0.5"
            />
            {flagged && <circle cx="142" cy={y + 8} r="3" fill="var(--color-danger)" />}
          </g>
        )
      })}
    </Mark>
  )
}

/** Progress: the same square bars the progress page stacks, part filled. */
export function ProgressMark() {
  return (
    <Mark>
      {[
        [16, 0.78],
        [34, 0.46],
        [52, 0.17],
      ].map(([y, fraction]) => (
        <g key={y}>
          <rect x="8" y={y} width="144" height="5" fill="var(--color-hairline)" />
          <rect x="8" y={y} width={144 * fraction} height="5" fill="var(--color-ok)" />
        </g>
      ))}
    </Mark>
  )
}
