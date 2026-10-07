import { accentFor } from '../../lib/format'
import { isWatched } from '../../lib/watchStorage'

/**
 * One of the two lines: an ordered list with a hairline rule down the edge it
 * shares with the other, and every title marked on that rule.
 *
 * The rule is the spine, and which side it sits on is the whole of the
 * difference between the two columns. Side by side they face each other, so the
 * band between them belongs to both and a thread can run straight across it.
 * Alone, a column always faces right, because a list that hangs off a rule on
 * its own right-hand edge reads backwards with nothing to its right.
 *
 * Rows are a fixed height, which is not cosmetic: it is what lets
 * `ShiftLinks` put a curve on row *n* without measuring anything.
 *
 * The handlers are delegated to the list rather than bound per row. A hundred
 * and twenty-eight rows is a hundred and twenty-eight fresh closures on every
 * hover otherwise, and the rows carry the id in an attribute regardless.
 *
 * `aside` is a column of precomputed strings, one per row, set at the outer
 * edge. Precomputed rather than derived per row because the two columns want
 * different things from it and only one of them is a property of the title at
 * all: the release line is dated, and the chronological line carries a running
 * total that depends on everything above it. Neither belongs in here.
 */
export function OrderColumn({
  movies,
  row,
  spine,
  progress,
  aside,
  activeId,
  selectedId,
  onHover,
  onSelect,
}) {
  const facingLeft = spine === 'right'

  function idAt(event) {
    return event.target.closest?.('[data-row]')?.dataset.row ?? null
  }

  return (
    <div className="relative min-w-0">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 w-[3px] bg-ink ${facingLeft ? '-right-px' : '-left-px'}`}
      />

      <ol
        onPointerOver={(event) => onHover(idAt(event))}
        onPointerLeave={() => onHover(null)}
        onFocus={(event) => onHover(idAt(event))}
        onBlur={() => onHover(null)}
        onClick={(event) => {
          const id = idAt(event)
          if (id) onSelect(id)
        }}
      >
        {movies.map((movie, index) => {
          const watched = isWatched(progress, movie.id)
          const active = movie.id === activeId
          // Watched titles take the same green they take on the timeline graph
          // and recede, which is the app's idiom everywhere: what is left to
          // watch is what you are scanning a list this long for.
          const colour = watched ? 'var(--color-ok)' : accentFor(movie)

          return (
            <li key={movie.id} style={{ height: row }}>
              <button
                type="button"
                data-row={movie.id}
                aria-pressed={movie.id === selectedId}
                className={[
                  'relative flex h-full w-full items-center gap-2 transition-colors',
                  facingLeft ? 'pr-4 pl-1' : 'pr-1 pl-4',
                  active ? 'bg-raised' : 'hover:bg-surface',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    // A station on the line, in its saga colour or cyan once
                    // watched. Watched titles recede through their text, not
                    // by fading the station.
                    'station absolute top-1/2 size-3 -translate-y-1/2 border-[1.5px] transition-transform',
                    facingLeft ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
                    active ? 'scale-[1.6]' : '',
                  ].join(' ')}
                  style={{ backgroundColor: colour }}
                />

                {facingLeft && aside && (
                  <Aside value={aside.values[index]} width={aside.width} dim={watched} side="left" />
                )}
                {!facingLeft && <Position index={index} dim={watched} />}

                <span
                  className={[
                    'min-w-0 flex-1 truncate text-sm transition-colors',
                    facingLeft ? 'text-right' : 'text-left',
                    active ? 'font-bold text-ink' : watched ? 'text-ink-faint' : 'font-medium text-ink',
                  ].join(' ')}
                >
                  {movie.title}
                </span>

                {facingLeft && <Position index={index} dim={watched} />}
                {!facingLeft && aside && (
                  <Aside
                    value={aside.values[index]}
                    width={aside.width}
                    dim={watched}
                    side="right"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Right-aligned in both columns, so the digits line up with each other. */
function Position({ index, dim }) {
  return (
    <span
      className={`meta w-8 shrink-0 text-right tabular-nums ${dim ? 'font-normal' : ''}`}
    >
      {index + 1}
    </span>
  )
}

/**
 * The row's figure, at the outer edge of its column and away from the position
 * number, so two runs of digits are never adjacent.
 *
 * Dropped below `sm`: a date and a position together are ~110px of a column
 * that is only ~120px wide on a phone, which would leave the titles truncated
 * to nothing. These are a wide-screen reading.
 */
function Aside({ value, width, dim, side }) {
  return (
    <span
      className={[
        'meta hidden shrink-0 tabular-nums sm:block',
        width,
        side === 'left' ? 'text-left' : 'text-right',
        dim ? 'font-normal' : '',
      ].join(' ')}
    >
      {value}
    </span>
  )
}
