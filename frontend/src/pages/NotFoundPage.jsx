import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="py-24">
      <p className="meta text-ink-faint">404</p>
      <h1 className="mt-2 text-2xl font-medium text-ink">No such page</h1>
      <Link
        to="/"
        className="meta mt-6 inline-block border border-hairline-strong px-4 py-2 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
      >
        Back to the catalog
      </Link>
    </div>
  )
}
