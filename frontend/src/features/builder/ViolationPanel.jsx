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
      <div role="status" className="panel border-l-[6px] border-l-ok px-4 py-3">
        <p className="display text-2xl text-ink">Valid order</p>
        <p className="mt-1 text-sm text-ink-dim">
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
        <section className="panel border-danger border-l-[6px] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="display text-2xl text-danger">
              {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
            </p>
            {outOfOrder.length > 0 && (
              <button
                type="button"
                onClick={onApplySuggestion}
                className="btn btn-sm"
              >
                Fix the order
              </button>
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {errors.map((violation, index) => (
              <li key={index} className="text-sm leading-relaxed text-ink">
                {formatViolation(violation, titles)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="border-2 border-ink bg-warn px-4 py-3 text-on-infinity">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="display text-2xl">
              {warnings.length} {warnings.length === 1 ? 'suggestion' : 'suggestions'}
            </p>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((violation, index) => (
              <li key={index} className="text-sm leading-relaxed">
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
          className="btn border-dashed"
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
