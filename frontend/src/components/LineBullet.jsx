import { lineBulletFor } from '../lib/format'

/**
 * The saga roundel: a title's line colour, cased in ink, with its phase number
 * printed inside -- the way a metro map marks which line a station is on.
 *
 * It carries the saga in text as well as colour, so the two sagas are never
 * told apart by hue alone.
 */
export function LineBullet({ movie, className = '' }) {
  const bullet = lineBulletFor(movie)
  return (
    <span
      className={`line-bullet ${className}`}
      style={{ backgroundColor: bullet.background, color: bullet.color }}
      title={bullet.label}
    >
      <span aria-hidden="true">{bullet.mark}</span>
      <span className="sr-only">{bullet.label}</span>
    </span>
  )
}
