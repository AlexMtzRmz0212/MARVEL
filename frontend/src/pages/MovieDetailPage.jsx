import { Link, useParams } from 'react-router'

import { useMovie } from '../api/catalog'
import { WatchToggle } from '../components/WatchToggle'
import { ErrorState, LoadingState } from '../components/states'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { isWatched } from '../lib/watchStorage'
import {
  MEDIA_LABEL,
  SAGA_LABEL,
  TIER_LABEL,
  accentFor,
  formatDate,
  formatRuntime,
  phaseLabel,
} from '../lib/format'

function LinkRow({ item, accent }) {
  return (
    <li>
      <Link
        to={`/movies/${item.id}`}
        className="hairline group flex gap-3 border-b py-3 transition-colors last:border-b-0 hover:bg-surface"
      >
        <span
          aria-hidden="true"
          className="mt-1 h-3 w-[2px] shrink-0"
          style={{
            backgroundColor: item.strength === 'essential' ? accent : 'transparent',
            outline: item.strength === 'essential' ? 'none' : `1px solid ${accent}`,
          }}
        />
        <div className="min-w-0">
          <p className="text-sm text-ink transition-colors group-hover:text-ink">
            {item.title}{' '}
            <span className="meta ml-1">
              {item.strength === 'essential' ? 'Required' : 'Recommended'}
            </span>
          </p>
          {item.note && <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{item.note}</p>}
        </div>
      </Link>
    </li>
  )
}

function Panel({ title, count, empty, children }) {
  return (
    <section>
      <h2 className="meta hairline flex items-baseline gap-2 border-b pb-2">
        {title}
        <span className="text-ink-dim">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="py-4 text-xs text-ink-faint">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  )
}

export function MovieDetailPage() {
  const { movieId } = useParams()
  const progress = useWatchProgress()
  const { data: movie, isPending, error, refetch } = useMovie(movieId)

  if (isPending) return <LoadingState label="Loading title" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const accent = accentFor(movie)
  const runtime = formatRuntime(movie.runtime_min)
  const watched = isWatched(progress, movie.id)

  return (
    <article className="py-8">
      <Link to="/" className="meta text-ink-faint transition-colors hover:text-ink">
        &larr; Catalog
      </Link>

      <header className="hairline mt-4 border-b pb-8">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-[3px]" style={{ backgroundColor: accent }} />
          <p className="meta" style={{ color: accent }}>
            {SAGA_LABEL[movie.saga]}
          </p>
        </div>

        <div className="mt-3 flex items-start gap-4">
          <h1 className="flex-1 text-3xl leading-tight font-medium tracking-tight text-ink sm:text-4xl">
            {movie.title}
          </h1>
          <div className="mt-1 shrink-0">
            <WatchToggle movieId={movie.id} watched={watched} title={movie.title} />
          </div>
        </div>

        <dl className="meta mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div>
            <dt className="sr-only">Released</dt>
            <dd>{formatDate(movie.release_date)}</dd>
          </div>
          <span aria-hidden="true">·</span>
          <div>
            <dt className="sr-only">Phase</dt>
            <dd>{phaseLabel(movie.phase)}</dd>
          </div>
          <span aria-hidden="true">·</span>
          <div>
            <dt className="sr-only">Format</dt>
            <dd>{MEDIA_LABEL[movie.media_type]}</dd>
          </div>
          {runtime && (
            <>
              <span aria-hidden="true">·</span>
              <div>
                <dt className="sr-only">Runtime</dt>
                <dd>{runtime}</dd>
              </div>
            </>
          )}
          <span aria-hidden="true">·</span>
          <div>
            <dt className="sr-only">Tier</dt>
            <dd>{TIER_LABEL[movie.tier]}</dd>
          </div>
          {movie.universe !== 'Earth-616' && (
            <>
              <span aria-hidden="true">·</span>
              <div>
                <dt className="sr-only">Universe</dt>
                <dd>{movie.universe}</dd>
              </div>
            </>
          )}
          <span aria-hidden="true">·</span>
          <div>
            <dt className="sr-only">Release number</dt>
            <dd className="tabular-nums">#{movie.release_order + 1} by release</dd>
          </div>
        </dl>

        {movie.synopsis && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-dim">{movie.synopsis}</p>
        )}

        <Link
          to={`/movies/${movie.id}/prereqs`}
          className="mt-6 inline-flex items-center gap-2 border border-hairline-strong px-4 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          View the full prerequisite chain
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </header>

      <div className="grid gap-10 py-8 md:grid-cols-2">
        <Panel
          title="Watch first"
          count={movie.prerequisites.length}
          empty="Nothing. This is a starting point, watchable cold."
        >
          {movie.prerequisites.map((item) => (
            <LinkRow key={item.id} item={item} accent={accent} />
          ))}
        </Panel>

        <Panel
          title="Unlocks"
          count={movie.unlocks.length}
          empty="Nothing yet depends on this one."
        >
          {movie.unlocks.map((item) => (
            <LinkRow key={item.id} item={item} accent={accent} />
          ))}
        </Panel>
      </div>
    </article>
  )
}
