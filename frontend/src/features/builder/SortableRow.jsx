import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { accentFor, formatRuntime, phaseLabel, year } from '../../lib/format'

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

  const accent = accentFor(movie)
  const runtime = formatRuntime(movie.runtime_min)

  const border =
    severity === 'error'
      ? 'border-danger/70 bg-danger/5'
      : severity === 'warning'
        ? 'border-warn/50 bg-warn/5'
        : 'border-hairline bg-surface'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'relative flex touch-none items-center gap-3 border px-3 py-2.5',
        border,
        isDragging ? 'z-10 opacity-90 shadow-lg shadow-black/40' : '',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      <span className="meta w-6 shrink-0 cursor-grab tabular-nums">{index + 1}</span>
      <span
        aria-hidden="true"
        className="h-7 w-[2px] shrink-0"
        style={{ backgroundColor: accent }}
      />

      {movie.poster_url && (
        <img
          src={movie.poster_url}
          alt=""
          loading="lazy"
          className="hairline h-10 w-7 shrink-0 border object-cover"
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{movie.title}</span>
        <span className="meta">
          {year(movie.release_date)} · {phaseLabel(movie.phase)}
          {runtime ? ` · ${runtime}` : ''}
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        // Without this the pointer sensor swallows the click and the button
        // never fires.
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`Remove ${movie.title}`}
        className="meta shrink-0 px-2 py-1 text-ink-faint transition-colors hover:text-danger"
      >
        Remove
      </button>
    </li>
  )
}
