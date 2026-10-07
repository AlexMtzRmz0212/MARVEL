/**
 * The one-time "bring this browser's data with you?" dialog, plus the summary
 * that follows it.
 */

export function MergePrompt({ merge }) {
  const { pending, summary, accept, decline, dismissSummary } = merge

  if (summary) {
    return (
      <div role="status" className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="floating bubble bubble-below bubble-left animate-popup-in mb-3 flex max-w-lg items-start gap-4 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink">{summary}</p>
          <button
            type="button"
            onClick={dismissSummary}
            className="btn btn-sm shrink-0"
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
    <div className="halftone fixed inset-0 z-50 flex items-center justify-center bg-paper/85 px-4 overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-prompt-title"
        className="floating w-full max-w-md p-6"
      >
        <h2 id="merge-prompt-title" className="display text-3xl text-ink">
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
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Merging copies them up and clears them from this device. Anything already in your account
          is kept as-is.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={accept}
            className="btn btn-primary"
          >
            Merge into my account
          </button>
          <button
            type="button"
            onClick={decline}
            className="btn"
          >
            Keep separate
          </button>
        </div>
      </div>
    </div>
  )
}
