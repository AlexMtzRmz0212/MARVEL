import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    // A line that stops short: the one place a dead end is drawn literally.
    <div className="py-20">
      <svg viewBox="0 0 200 24" aria-hidden="true" className="h-6 w-56" fill="none">
        <line x1="4" y1="12" x2="150" y2="12" stroke="var(--color-ink)" strokeWidth="11" strokeLinecap="round" />
        <line x1="4" y1="12" x2="150" y2="12" stroke="var(--color-infinity)" strokeWidth="5" strokeLinecap="round" />
        <line x1="150" y1="2" x2="150" y2="22" stroke="var(--color-ink)" strokeWidth="4" />
      </svg>
      <div className="relative mt-6 grid size-40 place-items-center">
        <span aria-hidden="true" className="speed-lines absolute inset-0" />
        <p className="burst size-24 rotate-6 text-4xl">404</p>
      </div>
      <h1 className="display animate-glitch-text mt-1 text-6xl text-ink">No such page</h1>
      <p className="mt-3 max-w-md text-base text-ink-dim">
        The line ends here. The address may be mistyped, or the page may have moved.
      </p>
      <Link to="/catalog" className="btn btn-primary mt-6">
        Back to the catalog
      </Link>
    </div>
  )
}
