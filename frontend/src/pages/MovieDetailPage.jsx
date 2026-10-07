import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useMovie } from '../api/catalog'
import { BackLink } from '../components/BackLink'
import { LineBullet } from '../components/LineBullet'
import { WatchToggle } from '../components/WatchToggle'
import { ErrorState, LoadingState } from '../components/states'
import { useWatchProgress } from '../hooks/useWatchProgress'
import { isWatched, setNotes, setRating } from '../lib/watchStorage'
import {
  MEDIA_LABEL,
  SAGA_LABEL,
  TIER_LABEL,
  accentFor,
  creditScenesLabel,
  formatDate,
  formatRuntime,
  phaseLabel,
  year,
} from '../lib/format'

/**
 * One stop on a route: the neighbouring title as a station on the line.
 *
 * Required stops get a solid ring, recommended ones a dashed ring, and both
 * say so in words, so the difference does not rest on the ring alone.
 */
function Stop({ item }) {
  const essential = item.strength === 'essential'
  return (
    <li className="relative pl-10">
      <span
        aria-hidden="true"
        className={`absolute top-5 left-[7px] size-5 rounded-full border-[3px] bg-surface ${
          essential ? 'border-ink' : 'border-dashed border-ink-dim'
        }`}
      />
      <Link
        to={`/movies/${item.id}`}
        className="group flex gap-3 py-2.5 transition-colors"
      >
        <span className="w-10 shrink-0">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt=""
              width={40}
              height={60}
              loading="lazy"
              decoding="async"
              className="aspect-[2/3] w-10 border-2 border-ink object-cover"
            />
          ) : (
            <span className="block aspect-[2/3] w-10 border-2 border-ink bg-raised" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-pretty text-ink group-hover:underline group-hover:underline-offset-2">
            {item.title}
          </span>
          <span className="meta mt-0.5 block">
            {essential ? 'Required' : 'Recommended'}
            {', '}
            {year(item.release_date)}
            {item.phase ? `, phase ${item.phase}` : ''}
          </span>
          {item.note && (
            <span className="mt-1 block text-sm leading-relaxed text-ink-dim">{item.note}</span>
          )}
        </span>
      </Link>
    </li>
  )
}

/**
 * A list of neighbours drawn as a length of line, in this title's saga colour
 * and cased in ink, with each neighbour a station on it.
 */
function Route({ title, count, empty, accent, voice, children }) {
  return (
    <section className="panel p-5">
      <h2 className={`caption caption-corner ${voice}`}>
        {title}
        <span className="ml-1.5 text-base font-bold tabular-nums">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="mt-3 text-sm text-ink-dim">{empty}</p>
      ) : (
        <div className="relative">
          <span aria-hidden="true" className="absolute inset-y-4 left-[11px] w-3 bg-ink" />
          <span
            aria-hidden="true"
            className="absolute inset-y-4 left-[14px] w-1.5"
            style={{ backgroundColor: accent }}
          />
          <ul className="relative">{children}</ul>
        </div>
      )}
    </section>
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
function CreditScenes({ movie, voice }) {
  const total = movie.credit_scenes
  const episodes = movie.credit_scene_episodes ?? []
  const note = movie.credit_scene_note

  // A bare count is already in the header. This section is for what a count
  // cannot say, so a film with nothing to add does not get an empty band.
  if (total === null || total === undefined) return null
  if (episodes.length === 0 && !note) return null

  return (
    <section className="panel mt-3 p-5">
      <h2 className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={`caption caption-corner ${voice}`}>After the credits</span>
        <span className="meta mt-0.5 text-sm">
          {total === 0 ? 'None' : `${total} scene${total === 1 ? '' : 's'}`}
          {episodes.length > 0 &&
            ` in ${episodes.length} episode${episodes.length === 1 ? '' : 's'}`}
        </span>
      </h2>

      {episodes.length > 0 && (
        <ul className="divide-y divide-hairline">
          {episodes.map((episode) => (
            <li key={episode.episode} className="flex items-baseline gap-3 py-3">
              <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-ink">
                Ep {episode.episode}
              </span>
              <div className="min-w-0 flex-1">
                {episode.name && <p className="text-sm font-semibold text-ink">{episode.name}</p>}
                {episode.note && (
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-dim">{episode.note}</p>
                )}
              </div>
              <span className="meta shrink-0">
                {episode.count} scene{episode.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-dim">{note}</p>}
    </section>
  )
}

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Whose voice the captions on this page are in. Comics give each narrator a
 * caption box of their own; here the saga is the narrator: the Infinity Saga
 * in classic yellow, the Multiverse Saga in magenta, and everything from
 * another studio's universe in black and white, a different book entirely.
 */
function captionVoice(movie) {
  if (movie.saga === 'Infinity Saga') return ''
  if (movie.saga === 'Multiverse Saga') return 'caption-multiverse'
  return 'caption-noir'
}

/**
 * Your score and notes for a title you have seen.
 *
 * Both live on the same watch-progress entry as the watched date, so they
 * travel with it: saved in this browser for a guest, to the account once
 * signed in, and carried across by the merge prompt. Shown only once a title
 * is watched, because un-watching removes the entry and everything on it.
 */
function YourTake({ movie, entry, voice }) {
  const saved = entry?.notes ?? ''
  const [draft, setDraft] = useState(saved)
  const [lastSaved, setLastSaved] = useState(saved)
  const rating = entry?.rating ?? null

  // Another tab or device can change the notes underneath this one. Adopting
  // the stored value whenever it moves (and the draft has not been edited
  // since) keeps the field honest without clobbering unsaved typing.
  if (saved !== lastSaved) {
    if (draft === lastSaved) setDraft(saved)
    setLastSaved(saved)
  }

  const dirty = draft !== saved

  function saveNotes() {
    if (dirty) setNotes(movie.id, draft)
  }

  return (
    <section className="panel mt-3 p-5" aria-labelledby="your-take">
      <h2 id="your-take" className={`caption caption-corner ${voice}`}>
        Your rating and notes
      </h2>

      <fieldset>
        <legend className="label text-ink-dim">Rating out of 10</legend>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {RATINGS.map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name={`rating-${movie.id}`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(movie.id, value)}
                className="peer sr-only"
              />
              <span
                className={[
                  'station grid size-9 cursor-pointer place-items-center text-sm font-bold tabular-nums transition-colors',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                  rating !== null && value <= rating
                    ? 'bg-infinity text-on-infinity'
                    : 'bg-surface text-ink hover:bg-raised',
                ].join(' ')}
              >
                {value}
              </span>
            </label>
          ))}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(movie.id, null)}
              className="btn btn-sm ml-1"
            >
              Clear rating
            </button>
          )}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-col gap-1.5">
        <label htmlFor={`notes-${movie.id}`} className="label text-ink-dim">
          Notes
        </label>
        <textarea
          id={`notes-${movie.id}`}
          name="notes"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveNotes}
          maxLength={2000}
          rows={4}
          placeholder="What to remember next time, or who to watch it with…"
          className="field resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveNotes} disabled={!dirty} className="btn btn-sm">
            Save note
          </button>
          <span className="meta" aria-live="polite">
            {dirty ? 'Unsaved' : saved ? 'Saved' : ''}
          </span>
          <span className="meta ml-auto tabular-nums">{draft.length} / 2000</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-dim">
        Marking this title unwatched clears its rating and notes.
      </p>
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
  const voice = captionVoice(movie)
  const runtime = formatRuntime(movie.runtime_min)
  const watched = isWatched(progress, movie.id)
  const creditScenes = creditScenesLabel(movie.credit_scenes)

  // Labelled fields rather than a run of values joined by dots: each one says
  // what it is, to everyone, not only to a screen reader.
  const facts = [
    ['Saga', SAGA_LABEL[movie.saga] ?? movie.saga],
    ['Released', formatDate(movie.release_date)],
    ['Phase', phaseLabel(movie.phase)],
    ['Format', MEDIA_LABEL[movie.media_type]],
    runtime && ['Runtime', runtime],
    ['Tier', TIER_LABEL[movie.tier]],
    ['Universe', movie.universe],
    creditScenes && ['Credits', creditScenes],
    ['By release', `No. ${movie.release_order + 1}`],
  ].filter(Boolean)

  return (
    <article className="py-8">
      <BackLink to="/catalog">Catalog</BackLink>

      <header className="mt-4 grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="relative w-40 self-start sm:w-48 md:w-full">
          {movie.poster_url ? (
            <img
              src={movie.poster_url}
              alt={`Poster for ${movie.title}`}
              width={500}
              height={750}
              fetchPriority="high"
              className="aspect-[2/3] w-full border-2 border-ink object-cover"
              style={{ boxShadow: `6px 6px 0 ${accent}` }}
            />
          ) : (
            <div className="aspect-[2/3] w-full border-2 border-ink bg-raised" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LineBullet movie={movie} />
            <span className="label text-ink-dim">{SAGA_LABEL[movie.saga] ?? movie.saga}</span>
          </div>

          <div className="mt-3 flex items-start gap-4">
            <h1 className="display flex-1 text-5xl text-balance text-ink sm:text-6xl">
              {movie.title}
            </h1>
            <div className="mt-1 shrink-0">
              <WatchToggle movieId={movie.id} watched={watched} title={movie.title} />
            </div>
          </div>

          {movie.synopsis && (
            <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-dim">
              {movie.synopsis}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-px border-2 border-ink bg-ink sm:grid-cols-3">
            {facts.map(([term, value]) => (
              <div key={term} className="bg-surface px-3 py-2">
                <dt className="meta">{term}</dt>
                <dd className="mt-0.5 text-sm font-semibold break-words text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <Link to={`/movies/${movie.id}/prereqs`} className="btn btn-primary mt-6">
            View the full prerequisite chain
          </Link>
        </div>
      </header>

      <div className="mt-8">
        {watched && (
          <YourTake key={movie.id} movie={movie} entry={progress[movie.id]} voice={voice} />
        )}

        <CreditScenes movie={movie} voice={voice} />

        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          <Route
            title="Watch first"
            count={movie.prerequisites.length}
            empty="Nothing. This is a starting point, watchable cold."
            accent={accent}
            voice={voice}
          >
            {movie.prerequisites.map((item) => (
              <Stop key={item.id} item={item} />
            ))}
          </Route>

          <Route
            title="Unlocks"
            count={movie.unlocks.length}
            empty="Nothing yet depends on this one."
            accent={accent}
            voice={voice}
          >
            {movie.unlocks.map((item) => (
              <Stop key={item.id} item={item} />
            ))}
          </Route>
        </div>
      </div>
    </article>
  )
}
