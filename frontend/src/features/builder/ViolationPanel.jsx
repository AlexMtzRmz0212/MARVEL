import { formatViolation } from '../../lib/validateOrder'

/**
 * Live feedback on the order.
 *
 * Errors and warnings are separated because they mean different things: an
 * essential prerequisite in the wrong place breaks the order, a recommended one
 * is a suggestion. Neither blocks saving — refusing to save a work in progress
 * would be infuriating — so this is advisory, with one-click fixes attached.
 */
export function ViolationPanel({ result, titles, missingCount, onApplySuggestion, onAddMissing }) {
  if (!result) return null

  const errors = result.violations.filter((violation) => violation.severity === 'error')
  const warnings = result.violations.filter((violation) => violation.severity === 'warning')
  const outOfOrder = errors.filter((violation) => violation.kind === 'out_of_order')

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="hairline border border-l-2 border-l-ok bg-surface px-4 py-3">
        <p className="meta text-ok">Valid order</p>
        <p className="mt-1 text-xs text-ink-dim">
          {result.checked_count === 0
            ? 'Add some titles to get started.'
            : 'Every prerequisite is present and in the right place.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {errors.length > 0 && (
        <section className="hairline border border-l-2 border-l-danger bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="meta text-danger">
              {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
            </p>
            {outOfOrder.length > 0 && (
              <button
                type="button"
                onClick={onApplySuggestion}
                className="meta border border-hairline-strong px-3 py-1 text-ink-dim transition-colors hover:border-danger hover:text-ink"
              >
                Fix the order
              </button>
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {errors.map((violation, index) => (
              <li key={index} className="text-xs leading-relaxed text-ink-dim">
                {formatViolation(violation, titles)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="hairline border border-l-2 border-l-warn bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="meta text-warn">
              {warnings.length} {warnings.length === 1 ? 'suggestion' : 'suggestions'}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((violation, index) => (
              <li key={index} className="text-xs leading-relaxed text-ink-dim">
                {formatViolation(violation, titles)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {missingCount > 0 && (
        <button
          type="button"
          onClick={onAddMissing}
          className="hairline border border-dashed px-4 py-2.5 text-sm text-ink-dim transition-colors hover:border-hairline-strong hover:text-ink"
        >
          {/* The count is the size of the full transitive closure, not just the
              directly-flagged titles: adding Endgame's three direct
              prerequisites would immediately surface theirs, and so on. */}
          Add {missingCount} missing {missingCount === 1 ? 'prerequisite' : 'prerequisites'}
        </button>
      )}
    </div>
  )
}
