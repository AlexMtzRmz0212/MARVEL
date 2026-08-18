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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { useOrderQuery, useSaveOrder } from '../../api/userOrders'
import { ErrorState, LoadingState } from '../../components/states'
import { formatTotalRuntime } from '../../lib/format'
import { completeOrder, validateOrder } from '../../lib/validateOrder'
import { SortableRow } from './SortableRow'
import { TitlePicker } from './TitlePicker'
import { ViolationPanel } from './ViolationPanel'
import { useOrderGraph } from './useOrderGraph'

/**
 * Reads the starting state once, synchronously.
 *
 * Both sources are available on the first render -- the saved order, already
 * resolved by the caller, and the query string for "build an order from this
 * chain" -- so there is nothing to synchronise in an effect.
 */
function initialState(existing, searchParams) {
  if (existing) return { name: existing.name, movieIds: existing.movie_ids }

  const start = searchParams.get('start')
  return {
    name: searchParams.get('name') || 'My watch order',
    movieIds: start ? [start] : [],
  }
}

export function OrderBuilderPage() {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()

  // A saved order comes from localStorage for guests and over the wire for
  // accounts, so it has to be awaited here. Resolving it *before* mounting
  // Builder is what preserves the once-only initial state below: Builder still
  // reads its starting values synchronously, it just does not exist until they
  // are available.
  const { data: existing, isPending, error } = useOrderQuery(orderId)

  if (orderId && isPending) return <LoadingState label="Loading order" />
  // A missing order is not fatal -- fall through to an empty builder rather
  // than dead-ending on a 404 for something the user may have just deleted.
  if (error && error.status !== 404) return <ErrorState error={error} />

  // Keying on the route remounts the builder when you switch orders, which is
  // what makes the once-only initial state above correct.
  return (
    <Builder
      key={orderId ?? `new:${searchParams.get('start') ?? ''}`}
      orderId={orderId}
      existing={existing ?? null}
      searchParams={searchParams}
    />
  )
}

function Builder({ orderId, existing, searchParams }) {
  const navigate = useNavigate()
  const { graph, titles, byId, movies, isPending, error } = useOrderGraph()
  const saveOrder = useSaveOrder()

  const [initial] = useState(() => initialState(existing, searchParams))
  const [name, setName] = useState(initial.name)
  const [movieIds, setMovieIds] = useState(initial.movieIds)
  const [savedAt, setSavedAt] = useState(null)

  // Runs on every reorder. It is a local O(E) pass over a few hundred edges, so
  // the feedback lands in the same frame as the drop rather than a request later.
  const result = useMemo(
    () => (graph ? validateOrder(graph, movieIds) : null),
    [graph, movieIds],
  )

  // What "add all missing" would actually add. The validator only flags direct
  // edges, but completing the order pulls in the whole ancestor closure, so
  // this is the number the button must show.
  const completed = useMemo(
    () => (graph && movieIds.length > 0 ? completeOrder(graph, movieIds) : movieIds),
    [graph, movieIds],
  )
  const missingCount = completed.length - movieIds.length

  const severityById = useMemo(() => {
    const map = new Map()
    for (const violation of result?.violations ?? []) {
      const current = map.get(violation.movie_id)
      if (violation.severity === 'error' || !current) map.set(violation.movie_id, violation.severity)
    }
    return map
  }, [result])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setMovieIds((current) => {
      const from = current.indexOf(active.id)
      const to = current.indexOf(over.id)
      return from < 0 || to < 0 ? current : arrayMove(current, from, to)
    })
    setSavedAt(null)
  }

  async function handleSave() {
    try {
      const record = await saveOrder.mutateAsync({ id: orderId, name, movie_ids: movieIds })
      setSavedAt(new Date())
      if (!orderId) navigate(`/orders/${record.id}`, { replace: true })
    } catch {
      // Rendered next to the button below; the mutation holds the error.
    }
  }

  if (isPending) return <LoadingState label="Loading catalog" />
  if (error) return <ErrorState error={error} />

  const totalRuntime = formatTotalRuntime(
    movieIds.reduce((sum, id) => sum + (byId.get(id)?.runtime_min ?? 0), 0),
  )

  return (
    <div className="py-8">
      <h1 className="sr-only">{orderId ? `Edit order: ${name}` : 'New order'}</h1>

      <div className="hairline flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <label className="meta" htmlFor="order-name">
            Order name
          </label>
          <input
            id="order-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSavedAt(null)
            }}
            className="mt-1 block w-full max-w-md border-0 border-b border-hairline bg-transparent pb-1 text-2xl font-medium tracking-tight text-ink focus:border-hairline-strong focus:outline-none"
          />
          <p className="meta mt-2">
            {movieIds.length} titles{totalRuntime ? ` · ${totalRuntime}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {savedAt && <span className="meta text-ok">Saved</span>}
          {saveOrder.error && (
            <span role="alert" className="meta text-danger">
              {saveOrder.error.message}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={movieIds.length === 0 || saveOrder.isPending}
            className="meta border border-hairline-strong px-4 py-2 text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveOrder.isPending ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>

      <div className="grid gap-8 py-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <ViolationPanel
            result={result}
            titles={titles}
            missingCount={missingCount}
            onApplySuggestion={() => {
              setMovieIds(result.suggested_order)
              setSavedAt(null)
            }}
            onAddMissing={() => {
              setMovieIds(completed)
              setSavedAt(null)
            }}
          />

          {movieIds.length === 0 ? (
            <div className="hairline border border-dashed px-6 py-16 text-center">
              <p className="meta">Pick titles from the right to start building</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={movieIds} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1.5">
                  {movieIds.map((id, index) => {
                    const movie = byId.get(id)
                    if (!movie) return null
                    return (
                      <SortableRow
                        key={id}
                        movie={movie}
                        index={index}
                        severity={severityById.get(id)}
                        onRemove={() => {
                          setMovieIds((current) => current.filter((item) => item !== id))
                          setSavedAt(null)
                        }}
                      />
                    )
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <TitlePicker
            movies={movies}
            chosenIds={movieIds}
            onAdd={(id) => {
              setMovieIds((current) => [...current, id])
              setSavedAt(null)
            }}
          />
        </aside>
      </div>
    </div>
  )
}
