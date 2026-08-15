/**
 * The one-time "bring this browser's data with you?" dialog, plus the summary
 * that follows it.
 */

export function MergePrompt({ merge }) {
  const { pending, summary, accept, decline, dismissSummary } = merge

  if (summary) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6">
        <div className="hairline flex max-w-lg items-start gap-4 border bg-surface px-5 py-4 shadow-lg">
          <p className="text-sm text-ink-dim">{summary}</p>
          <button
            type="button"
            onClick={dismissSummary}
            className="meta shrink-0 text-ink-faint transition-colors hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (!pending) return null

  const orderCount = pending.orders.length
  const watchedCount = Object.values(pending.watch_progress).filter(
    (entry) => entry?.watched_at,
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-prompt-title"
        className="hairline w-full max-w-md border bg-surface p-6 shadow-xl"
      >
        <h2 id="merge-prompt-title" className="text-lg font-medium tracking-tight text-ink">
          Bring this browser's data with you?
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This browser has{' '}
          <span className="text-ink">
            {orderCount} saved order{orderCount === 1 ? '' : 's'}
          </span>{' '}
          and <span className="text-ink">{watchedCount} watched titles</span> that aren't in your
          account yet.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">
          Merging copies them up and clears them from this device. Anything already in your account
          is kept as-is.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={accept}
            className="meta border border-hairline-strong px-4 py-2 text-ink transition-colors hover:bg-raised"
          >
            Merge into my account
          </button>
          <button
            type="button"
            onClick={decline}
            className="meta px-4 py-2 text-ink-faint transition-colors hover:text-ink-dim"
          >
            Keep separate
          </button>
        </div>
      </div>
    </div>
  )
}
