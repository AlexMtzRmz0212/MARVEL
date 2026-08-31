import { memo } from 'react'

/**
 * The threads between the two lines.
 *
 * One curve per title, from its place in release order to its place in the
 * chronology. This is the whole point of the page: the columns are two lists
 * anybody could print, and the only thing that says how far a title travels
 * between them is the line joining its two positions.
 *
 * Drawn in a viewBox 100 units wide however wide the band actually is, with
 * `preserveAspectRatio="none"`, so the horizontal scale is whatever the layout
 * gives and no measurement of the band is needed. The vertical scale stays 1:1
 * — the viewBox height is the pixel height — which is what lets a curve land
 * exactly on its row without the rows ever being measured either. Non-uniform
 * scaling would ordinarily smear the stroke along with the shape, so every
 * path takes `vector-effect: non-scaling-stroke` and stays a hairline.
 */

/**
 * How far the control points sit from their ends, in viewBox units.
 *
 * It has to be under half the width or the two pull past each other and the
 * curve doubles back on itself. Just under is what makes a line leave its spine
 * horizontally: departing perpendicular to the column is what separates
 * neighbouring threads at the only place they are all crowded together.
 */
const BEND = 44

function thread(row, from, to) {
  const y1 = from * row + row / 2
  const y2 = to * row + row / 2
  return `M0 ${y1}C${BEND} ${y1} ${100 - BEND} ${y2} 100 ${y2}`
}

/**
 * Every thread, drawn once and then left alone.
 *
 * Memoised on purpose. Pointing at a title re-renders this band, and a hundred
 * and twenty-eight paths reconciled per pointer move is real work for no gain:
 * none of them change. Only the group's opacity above and the single lit thread
 * below actually differ between one hover and the next.
 */
const Threads = memo(function Threads({ links, row }) {
  return links.map((link) => (
    <path key={link.id} d={thread(row, link.from, link.to)} vectorEffect="non-scaling-stroke" />
  ))
})

export function ShiftLinks({ links, row, height, activeId, activeColour }) {
  const active = activeId ? links.find((link) => link.id === activeId) : null

  return (
    <svg
      // The two ordered lists either side carry all of this in text, and a
      // screen reader has no use for a hundred and twenty-eight curves.
      aria-hidden="true"
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      {/* Faint by default so the whole band reads as one texture — where the
          crossings bunch up is where the two orders disagree most. Fainter
          still once something is lit, so the lit thread has somewhere to
          stand out from. */}
      <g
        fill="none"
        stroke="var(--color-hairline-strong)"
        strokeWidth="1"
        opacity={active ? 0.12 : 0.38}
        className="transition-opacity duration-200"
      >
        <Threads links={links} row={row} />
      </g>

      {active && (
        <path
          d={thread(row, active.from, active.to)}
          fill="none"
          stroke={activeColour}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
