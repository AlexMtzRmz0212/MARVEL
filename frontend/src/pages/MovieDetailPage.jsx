import { Link, useParams } from 'react-router'

import { useMovie } from '../api/catalog'
import { BackLink } from '../components/BackLink'
import { WatchToggle } from '../components/WatchToggle'
import { ErrorState, LoadingState } from '../components/states'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { isWatched } from '../lib/watchStorage'
import {
  MEDIA_LABEL,
  SAGA_LABEL,
  TIER_LABEL,
  accentFor,
  creditScenesLabel,
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

/**
 * The wink: what is left after the picture ends.
 *
 * `credit_scenes` is null when nobody has checked and 0 when somebody did and
 * there was nothing, and the difference is the whole point of the field -- "we
 * don't know" and "don't wait around" are different answers to sit through
 * eight minutes of credits for. Null renders nothing at all.
 *
 * A season is a dozen hours, so a count on its own would be useless: for a
 * series the answer has to name the episodes, which is what the seed file
 * stores and what the total is summed from.
 */
function CreditScenes({ movie, accent }) {
  const total = movie.credit_scenes
  const episodes = movie.credit_scene_episodes ?? []
  const note = movie.credit_scene_note

  // A bare count is already in the header. This section is for what a count
  // cannot say, so a film with nothing to add does not get an empty band.
  if (total === null || total === undefined) return null
  if (episodes.length === 0 && !note) return null

  return (
    <section className="hairline border-b py-8">
      <h2 className="meta hairline flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-2">
        After the credits
        <span className="text-ink-dim">
          {total === 0 ? 'None' : `${total} scene${total === 1 ? '' : 's'}`}
          {episodes.length > 0 &&
            ` in ${episodes.length} episode${episodes.length === 1 ? '' : 's'}`}
        </span>
      </h2>

      {episodes.length > 0 && (
        <ul>
          {episodes.map((episode) => (
            <li
              key={episode.episode}
              className="hairline flex items-baseline gap-3 border-b py-3 last:border-b-0"
            >
              <span className="meta shrink-0 tabular-nums" style={{ color: accent }}>
                Ep {episode.episode}
              </span>
              <div className="min-w-0 flex-1">
                {episode.name && <p className="text-sm text-ink">{episode.name}</p>}
                {episode.note && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{episode.note}</p>
                )}
              </div>
              <span className="meta shrink-0 tabular-nums">
                {episode.count} scene{episode.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">{note}</p>}
    </section>
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
  const creditScenes = creditScenesLabel(movie.credit_scenes)

  return (
    <article className="py-8">
      <BackLink to="/catalog">Catalog</BackLink>

      <header className="hairline mt-4 border-b pb-8">
        <div className="flex items-start gap-4">
          <h1 className="flex-1 text-3xl leading-tight font-medium tracking-tight text-ink sm:text-4xl">
            {movie.title}
          </h1>
          <div className="mt-1 shrink-0">
            <WatchToggle movieId={movie.id} watched={watched} title={movie.title} />
          </div>
        </div>

        <dl className="meta mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Saga leads the row rather than sitting above the title as a
              separate label: it is one more field about this title, and the
              accent it is drawn in is what makes it findable at a glance. */}
          <div>
            <dt className="sr-only">Saga</dt>
            <dd style={{ color: accent }}>{SAGA_LABEL[movie.saga]}</dd>
          </div>
          <span aria-hidden="true">·</span>
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
          <span aria-hidden="true">·</span>
          <div>
            <dt className="sr-only">Universe</dt>
            <dd>{movie.universe}</dd>
          </div>
          {creditScenes && (
            <>
              <span aria-hidden="true">·</span>
              <div>
                <dt className="sr-only">Credits scenes</dt>
                <dd>{creditScenes}</dd>
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
          className="mt-6 inline-flex items-center border border-hairline-strong px-4 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          View the full prerequisite chain
        </Link>
      </header>

      <CreditScenes movie={movie} accent={accent} />

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
