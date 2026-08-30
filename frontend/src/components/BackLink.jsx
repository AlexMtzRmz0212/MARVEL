import { Link } from 'react-router'

/**
 * The "up one level" link at the top of a detail page.
 *
 * The chevron is drawn rather than typed. A literal arrow character in the link
 * text is read out by a screen reader ("left arrow Catalog"), does not inherit
 * the stroke weight of anything around it, and renders differently in every
 * font a system stack might fall back to. An `aria-hidden` SVG has none of
 * those problems and matches the drawn marks used elsewhere in the app.
 */
export function BackLink({ to, children }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 text-ink-faint transition-colors hover:text-ink"
    >
      <svg
        viewBox="0 0 8 12"
        aria-hidden="true"
        className="h-2.5 w-2 shrink-0 transition-transform group-hover:-translate-x-0.5"
        fill="none"
      >
        <path
          d="M6.5 1 L1.5 6 L6.5 11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      </svg>
      <span className="label">{children}</span>
    </Link>
  )
}
