import { Button } from './ui'

/**
 * Edges the catalog already implies another way: A needs C, but A needs B and B
 * needs C. The server finds them (`redundant_edges` on the editor state) because
 * "implied" is strength-aware and that logic lives in one place; this only
 * offers the two sensible answers to each one.
 *
 * - Remove it: the longer path says the same thing, so the edge is clutter.
 * - Keep it with a note: the note is what marks it as a *direct* prerequisite
 *   in the UI, and once it has one the server stops calling it unexplained.
 *
 * Removing writes through the same validate-then-save path as every other edit,
 * so a bulk removal is one write and one entry in the history.
 */

/** The `"owner<-prerequisite"` key an edge is identified by. */
const redundantKey = (edge) => `${edge.owner_id}<-${edge.prerequisite_id}`

export function RedundantEdges({ edges, movies, saving, onRemove, onRemoveAll, onOpen }) {
  if (!edges?.length) return null

  const titleOf = (id) => movies.find((movie) => movie.id === id)?.title ?? id
  const unexplained = edges.filter((edge) => !edge.note)

  return (
    <div className="space-y-2 border border-warn/40 bg-warn/5 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="meta text-ink">Redundant edges ({edges.length})</p>
        {onRemoveAll && unexplained.length > 0 && (
          <Button
            tone="danger"
            disabled={saving}
            onClick={() => onRemoveAll(unexplained)}
            title="Removes only the ones without a note, in one save"
          >
            Remove all {unexplained.length} without a note
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {edges.map((edge) => (
          <li
            key={redundantKey(edge)}
            className="hairline flex flex-wrap items-center justify-between gap-2 border bg-paper p-2"
          >
            <div className="min-w-0 text-xs leading-snug text-ink-dim">
              <p>
                <span className="text-ink">{titleOf(edge.prerequisite_id)}</span>
                <span aria-hidden="true"> → </span>
                <span className="text-ink">{titleOf(edge.owner_id)}</span>
              </p>
              <p className="meta normal-case tracking-normal">
                {edge.strength} · already implied via {titleOf(edge.via)}
                {edge.note ? ` · kept on purpose: “${edge.note}”` : ''}
              </p>
            </div>
            <div className="flex gap-1.5">
              {onOpen && (
                <Button onClick={() => onOpen(edge.owner_id)}>
                  {edge.note ? 'Open' : 'Add a note'}
                </Button>
              )}
              <Button
                tone="danger"
                disabled={saving}
                onClick={() => onRemove([edge])}
                aria-label={`Remove ${titleOf(edge.prerequisite_id)} → ${titleOf(edge.owner_id)}`}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
