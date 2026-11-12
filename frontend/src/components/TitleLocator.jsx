import { Link } from 'react-router'

import { year } from '../lib/format'
import { LineBullet } from './LineBullet'
import { TitleLink } from './TitlePeek'

/**
 * A title's poster, and the places it turns up.
 *
 * What the search bubble shows on the orders and progress pages, where the
 * question is not "open this title" but "where is it in all of this". Each line
 * is one place -- an order, a phase, a saga -- with a short fact about it, and
 * links to that place if it has a page. The poster is the way to the title
 * itself.
 *
 * `onNavigate` is called when any link is followed, so the bubble can close
 * behind the reader rather than staying open over the page they have gone to.
 *
 * lines: `[{ key, group, label, detail, to }]`
 */
export function TitleLocator({ movie, lines, note, empty, onNavigate }) {
  return (
    <div className="flex gap-3">
      <TitleLink
        movieId={movie.id}
        onClick={onNavigate}
        aria-label={`Open ${movie.title}`}
        title="Open this title"
        className="panel relative block w-28 shrink-0 self-start overflow-hidden"
      >
        <div className="relative aspect-[2/3] bg-raised">
          {movie.poster_url && (
            <img
              src={movie.poster_url}
              alt=""
              width={500}
              height={750}
              decoding="async"
              className="size-full object-cover"
            />
          )}
          <LineBullet movie={movie} className="absolute top-1.5 left-1.5" />
        </div>
      </TitleLink>

      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight font-bold text-pretty text-ink">{movie.title}</p>
        <p className="meta mt-0.5">
          {[year(movie.release_date), note].filter(Boolean).join(', ')}
        </p>

        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">{empty}</p>
        ) : (
          <ul className="mt-2 max-h-56 divide-y divide-hairline overflow-y-auto">
            {lines.map((line) => {
              const body = (
                <>
                  <span className="meta block">{line.group}</span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">
                      {line.label}
                    </span>
                    <span className="meta shrink-0 tabular-nums">{line.detail}</span>
                  </span>
                </>
              )
              return (
                <li key={line.key}>
                  {line.to ? (
                    <Link
                      to={line.to}
                      onClick={onNavigate}
                      className="block py-1.5 transition-colors hover:bg-raised"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="py-1.5">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
