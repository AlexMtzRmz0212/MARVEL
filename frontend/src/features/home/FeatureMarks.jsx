/**
 * Four small drawings, one per thing the app does.
 *
 * Each one is a reduction of the view it stands for rather than an icon of it,
 * drawn in the same vocabulary as the views themselves: posters with their saga
 * roundel, lines cased in ink running between stations, a draft order with one
 * row flagged, the progress lines. Same shapes, same colours, a fraction of the
 * size, which is why none of them needs a caption.
 *
 * All decorative: the heading and the line beneath each panel say the same
 * thing in words, so these are hidden from assistive tech rather than
 * described twice.
 */

const INK = 'var(--color-ink)'
const INFINITY = 'var(--color-infinity)'
const MULTIVERSE = 'var(--color-multiverse)'
const ADJACENT = 'var(--color-adjacent)'

function Mark({ children, className = 'h-16 w-full' }) {
  return (
    <svg viewBox="0 0 160 72" aria-hidden="true" className={className} fill="none">
      {children}
    </svg>
  )
}

/** A length of line: colour inside an ink casing. */
function Line({ from, to, colour, dashed }) {
  if (dashed) {
    return (
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={INK} strokeWidth="1.25" strokeDasharray="3 3" />
    )
  }
  return (
    <>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={colour} strokeWidth="2.5" strokeLinecap="round" />
    </>
  )
}

/** The catalog: posters in a row, each with its saga roundel, one already seen. */
export function CatalogMark({ className }) {
  const cards = [
    { accent: INFINITY },
    { accent: INFINITY, watched: true },
    { accent: MULTIVERSE },
    { accent: ADJACENT },
    { accent: MULTIVERSE },
  ]

  return (
    <Mark className={className}>
      {cards.map((card, index) => {
        const x = 6 + index * 30.5
        return (
          <g key={x}>
            <rect x={x} y="8" width="26" height="40" fill="var(--color-raised)" stroke={INK} strokeWidth="1.5" />
            <circle cx={x + 6} cy="14" r="3.5" fill={card.accent} stroke={INK} strokeWidth="1.25" />
            {card.watched && <circle cx={x + 20} cy="14" r="3.5" fill="var(--color-ok)" stroke={INK} strokeWidth="1.25" />}
            <rect x={x} y="53" width={card.watched ? 18 : 22} height="3" fill="var(--color-ink-dim)" />
            <rect x={x} y="59" width="12" height="2.5" fill="var(--color-ink-faint)" />
          </g>
        )
      })}
    </Mark>
  )
}

/** The timeline: lines running left to right through stations, one dashed. */
export function TimelineMark({ className }) {
  const nodes = {
    a1: [14, 20],
    a2: [14, 52],
    b1: [58, 12],
    b2: [58, 36],
    b3: [58, 60],
    c1: [104, 22],
    c2: [104, 50],
    d1: [146, 36],
  }
  const edges = [
    ['a1', 'b1', INFINITY],
    ['a1', 'b2', INFINITY],
    ['a2', 'b2', null, true],
    ['a2', 'b3', INFINITY],
    ['b1', 'c1', INFINITY],
    ['b2', 'c1', INFINITY],
    ['b3', 'c2', MULTIVERSE],
    ['c1', 'd1', MULTIVERSE],
    ['c2', 'd1', MULTIVERSE],
  ]

  return (
    <Mark className={className}>
      {edges.map(([from, to, colour, dashed]) => (
        <Line key={`${from}${to}`} from={nodes[from]} to={nodes[to]} colour={colour} dashed={dashed} />
      ))}
      {Object.entries(nodes).map(([key, [cx, cy]]) => (
        <circle key={key} cx={cx} cy={cy} r="4" fill="var(--color-surface)" stroke={INK} strokeWidth="2" />
      ))}
    </Mark>
  )
}

/** A draft order: numbered rows in hand-picked sequence, one of them out of order. */
export function OrderMark({ className }) {
  return (
    <Mark className={className}>
      {[6, 27, 48].map((y, index) => {
        const flagged = index === 1
        return (
          <g key={y}>
            <rect
              x="6"
              y={y}
              width="148"
              height="17"
              fill="var(--color-surface)"
              stroke={flagged ? 'var(--color-danger)' : INK}
              strokeWidth="1.5"
            />
            <circle cx="16" cy={y + 8.5} r="5" fill={INK} />
            <rect x="27" y={y + 7} width={flagged ? 58 : 76} height="3" fill="var(--color-ink-dim)" />
            {flagged && <circle cx="143" cy={y + 8.5} r="3.5" fill="var(--color-danger)" />}
          </g>
        )
      })}
    </Mark>
  )
}

/** Progress: the same cased lines the progress page stacks, part travelled. */
export function ProgressMark({ className }) {
  return (
    <Mark className={className}>
      {[
        [16, 0.78],
        [36, 0.46],
        [56, 0.17],
      ].map(([y, fraction]) => (
        <g key={y}>
          <rect x="8" y={y - 4} width="144" height="8" fill="var(--color-surface)" stroke={INK} strokeWidth="1.5" />
          <rect x="9" y={y - 3} width={142 * fraction} height="6" fill="var(--color-ok)" />
        </g>
      ))}
    </Mark>
  )
}
