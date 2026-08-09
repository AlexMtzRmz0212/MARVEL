/** Shared loading / error / empty states, so every view fails the same way. */

export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-3 px-1 py-16 text-ink-faint">
      <span
        className="size-3 animate-spin rounded-full border border-hairline-strong border-t-ink-dim"
        aria-hidden="true"
      />
      <span className="meta">{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const isNotFound = error?.status === 404
  return (
    <div className="hairline mx-1 my-12 max-w-lg border border-l-2 border-l-danger bg-surface p-6">
      <p className="meta text-danger">{isNotFound ? 'Not found' : 'Something went wrong'}</p>
      <p className="mt-2 text-sm text-ink-dim">
        {isNotFound
          ? 'There is no title with that id in the catalog.'
          : (error?.message ?? 'The request failed.')}
      </p>
      {onRetry && !isNotFound && (
        <button
          type="button"
          onClick={onRetry}
          className="meta mt-4 border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return (
    <div className="hairline my-12 border border-dashed px-6 py-16 text-center">
      <p className="meta">{children}</p>
    </div>
  )
}
