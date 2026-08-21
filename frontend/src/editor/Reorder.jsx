import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { accentFor } from '../lib/format'

/**
 * Array order is the chronological order, so this list *is* the timeline.
 *
 * dnd-kit rather than the drag library the Streamlit build had to use: the same
 * one the shipped order builder uses, which means a keyboard sensor comes with
 * it and the reorder is reachable without a pointer at all.
 *
 * A move that would put a title before something it depends on is refused by
 * the server and snaps back, because the chronological order having to be a
 * valid watch order is the promise the whole catalog rests on.
 */

function Row({ movie, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: movie.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'hairline flex touch-none items-center gap-2 border bg-surface px-2 py-1.5',
        isDragging ? 'z-10 opacity-90 shadow-lg shadow-black/40' : '',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      <span className="meta w-7 shrink-0 cursor-grab tabular-nums">{index + 1}</span>
      <span
        aria-hidden="true"
        className="h-6 w-[2px] shrink-0"
        style={{ backgroundColor: accentFor(movie) }}
      />
      {movie.poster_url && (
        <img
          src={movie.poster_url}
          alt=""
          loading="lazy"
          className="hairline h-9 w-6 shrink-0 border object-cover"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-ink">{movie.title}</span>
        <span className="meta">{(movie.release_date ?? '').slice(0, 4) || '—'}</span>
      </span>
    </li>
  )
}

export function Reorder({ movies, onEdit }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = movies.map((movie) => movie.id)

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id)
    const to = ids.indexOf(over.id)
    if (from < 0 || to < 0) return
    onEdit((document) => {
      document.movies = arrayMove(document.movies, from, to)
    })
  }

  return (
    <div className="space-y-2">
      <p className="meta normal-case tracking-normal">
        Array order is the chronological order. Drag a title and it saves — unless the move would
        put it before something it requires, in which case it snaps back.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {movies.map((movie, index) => (
              <Row key={movie.id} movie={movie} index={index} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
