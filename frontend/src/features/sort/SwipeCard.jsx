import { LineBullet } from '../../components/LineBullet'
import { MEDIA_LABEL, formatRuntime, phaseLabel, year } from '../../lib/format'
import { DIRECTIONS, swipeIntent } from './swipe'

/** Where each stamp lands and what it is inked in. */
const STAMP = {
  right: { className: 'top-6 left-4 -rotate-12', color: 'var(--color-ok)' },
  left: { className: 'top-6 right-4 rotate-12', color: 'var(--color-danger)' },
  down: { className: 'bottom-24 left-1/2 -translate-x-1/2 -rotate-6', color: 'var(--color-ink)' },
}

/** Where a card goes when it leaves, from wherever it was let go. */
function flyOut(direction, offset) {
  switch (direction) {
    case 'right':
      return `translate(150%, ${offset.y}px) rotate(28deg)`
    case 'left':
      return `translate(-150%, ${offset.y}px) rotate(-28deg)`
    case 'down':
      return `translate(${offset.x}px, 140%) rotate(${offset.x / 20}deg)`
    default:
      return ''
  }
}

/**
 * One card in the quick-sort deck.
 *
 * The poster is the whole card, because recognising a title is a glance at its
 * poster long before it is reading its name. The name and the facts that tell
 * near-namesakes apart -- year, phase, film or series -- sit on a band across
 * the bottom.
 *
 * `behind` draws the next card in the pile: smaller, inert, and hidden from
 * assistive tech, which is told about one card at a time.
 */
export function SwipeCard({ movie, offset, leaving, handlers, behind = false }) {
  const facts = [
    year(movie.release_date),
    movie.phase ? phaseLabel(movie.phase) : null,
    movie.media_type === 'series' && movie.episode_count > 0
      ? `${movie.episode_count} episodes`
      : movie.media_type === 'film'
        ? formatRuntime(movie.runtime_min)
        : MEDIA_LABEL[movie.media_type],
  ].filter(Boolean)

  let transform = 'translate(0, 10px) scale(0.94)'
  let transition = 'transform 0.2s ease-out'
  let intent = { direction: null, strength: 0 }

  if (!behind) {
    if (leaving) {
      transform = flyOut(leaving, offset)
      transition = 'transform 0.24s ease-in'
      intent = { direction: leaving, strength: 1 }
    } else {
      transform = `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x / 18}deg)`
      // Follow the finger exactly while dragging; spring back when let go.
      transition = offset.dragging ? 'none' : 'transform 0.18s ease-out'
      intent = swipeIntent(offset.x, offset.y, offset.width, offset.height)
    }
  }

  return (
    <div
      {...(behind ? {} : handlers)}
      aria-hidden={behind || undefined}
      role={behind ? undefined : 'group'}
      aria-roledescription={behind ? undefined : 'card'}
      aria-label={behind ? undefined : `${movie.title}, ${facts.join(', ')}`}
      className={[
        'panel absolute inset-0 flex touch-none flex-col overflow-hidden select-none',
        behind ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing',
      ].join(' ')}
      style={{ transform, transition, zIndex: behind ? 0 : 1 }}
    >
      <div className="relative min-h-0 flex-1 bg-raised">
        {movie.poster_url && (
          <img
            src={movie.poster_url}
            alt=""
            draggable={false}
            width={500}
            height={750}
            className="size-full object-cover"
          />
        )}
        <LineBullet movie={movie} className="absolute top-2 left-2" />
      </div>

      <div className="border-t-[3px] border-ink bg-surface px-4 py-3">
        <p className="text-lg leading-tight font-bold text-pretty text-ink">{movie.title}</p>
        <p className="meta mt-1">{facts.join(', ')}</p>
      </div>

      {intent.direction && (
        <span
          aria-hidden="true"
          className={`stamp ${STAMP[intent.direction].className}`}
          style={{ color: STAMP[intent.direction].color, opacity: intent.strength }}
        >
          {DIRECTIONS[intent.direction].stamp}
        </span>
      )}
    </div>
  )
}
