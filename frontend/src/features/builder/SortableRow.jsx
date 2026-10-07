import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { LineBullet } from '../../components/LineBullet'
import { formatRuntime, phaseLabel, year } from '../../lib/format'

/**
 * One draggable row.
 *
 * The whole row is the drag handle so it is easy to grab with a mouse, and
 * dnd-kit's keyboard sensor makes the same reorder reachable with the keyboard
 * alone — which is the main reason for using it over native HTML5 drag events.
 */
export function SortableRow({ movie, index, severity, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: movie.id,
  })

  const runtime = formatRuntime(movie.runtime_min)
  const details = [year(movie.release_date), phaseLabel(movie.phase), runtime].filter(Boolean)

  // A flagged row is cased in the colour of its problem, and says so in words
  // beside the title, so it is never told by colour alone.
  const border =
    severity === 'error'
      ? 'border-danger border-l-[6px]'
      : severity === 'warning'
        ? 'border-ink border-l-[6px] border-l-warn'
        : 'border-ink'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'relative flex cursor-grab touch-none items-center gap-3 border-2 bg-surface px-3 py-2 active:cursor-grabbing',
        border,
        isDragging ? 'z-10 shadow-[4px_4px_0_var(--color-shadow)]' : '',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      {/* The stop number, as a roundel: this is a route the reader is laying. */}
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold tabular-nums text-paper">
        {index + 1}
      </span>

      {movie.poster_url ? (
        <img
          src={movie.poster_url}
          alt=""
          width={28}
          height={42}
          loading="lazy"
          decoding="async"
          className="h-[42px] w-7 shrink-0 border-2 border-ink object-cover"
        />
      ) : (
        <span className="h-[42px] w-7 shrink-0 border-2 border-ink bg-raised" />
      )}

      <LineBullet movie={movie} className="size-6 text-[11px]" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{movie.title}</span>
        <span className="meta">
          {details.join(', ')}
          {severity === 'error' && <span className="text-danger">, out of place</span>}
          {severity === 'warning' && <span className="text-ink-dim">, worth moving</span>}
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        // Without this the pointer sensor swallows the click and the button
        // never fires.
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`Remove ${movie.title}`}
        className="btn btn-sm shrink-0 border-transparent bg-transparent text-ink-dim shadow-none hover:translate-0 hover:border-danger hover:bg-transparent hover:text-danger hover:shadow-none"
      >
        Remove
      </button>
    </li>
  )
}
