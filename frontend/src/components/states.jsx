/** Shared loading / error / empty states, so every view fails the same way. */

export function LoadingState({ label = 'Loading' }) {
  return (
    // A station blinking on the line: the app's own glyph for "something is
    // on its way", in place of a generic spinner.
    <div role="status" className="flex items-center gap-3 px-1 py-16">
      <span aria-hidden="true" className="relative flex h-3 w-16 items-center">
        <span className="h-1.5 w-full bg-ink" />
        <span className="station absolute right-0 size-3 animate-pulse bg-infinity" />
      </span>
      <span className="meta">{label}…</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const isNotFound = error?.status === 404
  return (
    <div role="alert" className="panel mx-1 my-12 max-w-lg border-l-[6px] border-l-danger p-6">
      <p className="display text-2xl text-danger">{isNotFound ? 'Not found' : 'Something went wrong'}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        {isNotFound
          ? 'There is no title with that id in the catalog.'
          : (error?.message ?? 'The request failed.')}
      </p>
      {onRetry && !isNotFound && (
        <button
          type="button"
          onClick={onRetry}
          className="btn mt-4"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return (
    <div className="halftone my-12 border-2 border-dashed border-ink px-6 py-16 text-center">
      <p className="inline-block bg-paper px-2 text-sm font-semibold text-ink-dim">{children}</p>
    </div>
  )
}
