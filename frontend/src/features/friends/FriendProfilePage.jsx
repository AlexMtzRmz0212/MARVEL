import { useMemo } from 'react'
import { Link, useParams } from 'react-router'

import { useMovies } from '../../api/catalog'
import { useFriends, useFriendsProgress } from '../../api/friends'
import { useAuth } from '../../auth/AuthContext'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { SAGA_LABEL, formatTotalRuntime } from '../../lib/format'
import { isWatched, progressFor } from '../../lib/watchStorage'

/**
 * One friend, read against the catalogue.
 *
 * Everything on this page beyond the name and the date is **derived**, not
 * fetched. The server sends a display name and a list of watched title ids, and
 * that is the entire disclosure a friendship makes (see `schemas/friends.py`).
 * The percentages, the runtime, the saga breakdown and the four-way split are
 * all that list crossed with a catalogue the browser already has. Adding a
 * "profile" therefore widened the API's disclosure by nothing at all, which is
 * the property worth protecting if this page grows.
 *
 * It reads the same `useFriendsProgress` cache entry the compare page fills, so
 * opening a profile after comparing costs no request, and the two can never
 * disagree about what somebody has seen.
 *
 * The layout answers the question people actually open a friend's page for,
 * which is not "how are they doing" but "what does this mean for us": their bar
 * sits directly under yours at the same scale, and the counts below it are all
 * links into the comparison rather than figures to admire.
 */

/** One saga's worth of the catalogue, for whichever of the two people. */
function SagaRow({ label, movieIds, progress, tint }) {
  const stats = progressFor(progress, movieIds)

  return (
    <li className="border-b border-hairline py-3 last:border-b-0">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-semibold text-ink">{label}</span>
        <span className="meta shrink-0 tabular-nums">
          {stats.watched} of {stats.total}, {stats.percent}%
        </span>
      </div>
      <ProgressBar percent={stats.percent} accent={tint} />
    </li>
  )
}

/**
 * One of the four counts.
 *
 * `truncate` on the term and `break-words` on the note are not belt and braces:
 * two of the four carry a display name, which is eighty characters of whatever
 * somebody typed and need not contain a space. In a grid cell, whose default
 * `min-width: auto` refuses to shrink below its longest word, that is a
 * horizontal scrollbar on the whole page rather than an ugly label.
 */
function Figure({ label, value, blurb, to }) {
  const body = (
    <>
      <dt className="meta truncate">{label}</dt>
      <dd className="display text-4xl normal-case tabular-nums text-ink">{value}</dd>
      <dd className="mt-0.5 break-words text-sm text-ink-dim">{blurb}</dd>
    </>
  )

  return (
    <div className="min-w-0">
      {to ? (
        <Link to={to} className="block transition-colors hover:bg-raised">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  )
}

export function FriendProfilePage() {
  const { friendId } = useParams()
  const { user } = useAuth()
  const mine = useWatchProgress()
  const { data: movies, isPending: catalogPending, error, refetch } = useMovies({ order: 'release' })
  const friends = useFriends()
  const progress = useFriendsProgress()

  const friend = friends.data?.find((row) => row.user_id === friendId)
  const theirProgress = progress.data?.find((row) => row.user_id === friendId)

  // Their watched ids in the shape every existing helper already reads. The
  // adapter is the same one `CompareProgressPage` uses and for the same reason:
  // `isWatched` and `progressFor` test `progress[id].watched_at` for truth and
  // nothing else, so a bare `true` is enough and no timestamp is invented.
  const theirs = useMemo(
    () =>
      Object.fromEntries((theirProgress?.watched_ids ?? []).map((id) => [id, { watched_at: true }])),
    [theirProgress],
  )

  const split = useMemo(() => {
    if (!movies || !theirProgress) return null

    const counts = { both: 0, you: 0, them: 0, neither: 0 }
    const onlyTheirs = []
    for (const movie of movies) {
      const yours = isWatched(mine, movie.id)
      const their = isWatched(theirs, movie.id)
      counts[yours && their ? 'both' : yours ? 'you' : their ? 'them' : 'neither'] += 1
      if (their && !yours) onlyTheirs.push(movie)
    }
    return { counts, onlyTheirs }
  }, [movies, mine, theirs, theirProgress])

  const sagas = useMemo(() => {
    if (!movies) return []
    const grouped = new Map()
    for (const movie of movies) {
      if (!grouped.has(movie.saga)) grouped.set(movie.saga, [])
      grouped.get(movie.saga).push(movie.id)
    }
    return [...grouped.entries()]
      .map(([saga, ids]) => ({ saga, ids }))
      .sort((a, b) => b.ids.length - a.ids.length)
  }, [movies])

  if (!user) {
    return (
      <div className="py-8">
        <h1 className="display text-5xl text-ink sm:text-6xl">Friends</h1>
        <p className="mt-3 max-w-xl text-sm text-ink-dim">
          Friend profiles need an account.{' '}
          <Link to="/login" className="font-semibold text-ink underline underline-offset-4 hover:decoration-2">
            Sign in
          </Link>{' '}
          to see them.
        </p>
      </div>
    )
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (catalogPending || friends.isPending || progress.isPending) {
    return <LoadingState label="Loading their progress" />
  }

  // Not an error state: a friend removed in another tab, or a link to somebody
  // who was never yours, is an ordinary answer and reads as a sentence.
  if (!friend || !theirProgress) {
    return (
      <div className="py-8">
        <h1 className="display text-5xl text-ink sm:text-6xl">Not on your friends list</h1>
        <p className="mt-3 max-w-xl text-sm text-ink-dim">
          Either this friendship has ended, or the link was never yours to follow. Nothing about
          them is shown unless you are both still friends.
        </p>
        <p className="mt-4">
          <Link
            to="/friends"
            className="btn btn-sm"
          >
            Back to friends
          </Link>
        </p>
      </div>
    )
  }

  const name = friend.display_name || 'Someone'
  const allIds = movies.map((movie) => movie.id)
  const myStats = progressFor(mine, allIds)
  const theirStats = progressFor(theirs, allIds)
  const theirRuntime = movies.reduce(
    (sum, movie) => sum + (isWatched(theirs, movie.id) ? (movie.runtime_min ?? 0) : 0),
    0,
  )
  const compareHref = `/progress/compare?friends=${friend.user_id}`

  return (
    <div className="py-8">
      <div className="pb-6">
        <p className="mb-2">
          <Link
            to="/friends"
            className="label text-ink underline underline-offset-4 hover:decoration-2"
          >
            Back to friends
          </Link>
        </p>
        <h1 className="display break-words text-5xl text-ink sm:text-6xl">{name}</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          {theirStats.watched} of {theirStats.total} titles marked watched
          {theirRuntime > 0 ? `, about ${formatTotalRuntime(theirRuntime)} of viewing` : ''}.
        </p>
      </div>

      {/* Their bar directly under yours, at the same scale. Two figures in a
       * sentence are a comparison nobody can actually make; two bars one above
       * the other are one glance. */}
      <section className="panel mt-3 p-5">
        <h2 className="caption caption-corner">Side by side</h2>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">You</span>
              <span className="meta shrink-0 tabular-nums">
                {myStats.watched} of {myStats.total}, {myStats.percent}%
              </span>
            </div>
            <ProgressBar percent={myStats.percent} />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold text-ink">{name}</span>
              <span className="meta shrink-0 tabular-nums">
                {theirStats.watched} of {theirStats.total}, {theirStats.percent}%
              </span>
            </div>
            <ProgressBar percent={theirStats.percent} accent="var(--color-multiverse)" />
          </div>
        </div>
      </section>

      {split && (
        <section className="panel mt-3 p-5">
          <h2 className="caption caption-corner">The difference</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure
              label="Both"
              value={split.counts.both}
              blurb="you have both seen it"
              to={compareHref}
            />
            <Figure
              label="Only you"
              value={split.counts.you}
              blurb={`${name} has not got to it`}
              to={compareHref}
            />
            <Figure
              label={`Only ${name}`}
              value={split.counts.them}
              blurb="they can tell you about it"
              to={compareHref}
            />
            <Figure
              label="Neither"
              value={split.counts.neither}
              blurb="still ahead of both of you"
              to={compareHref}
            />
          </dl>
          <p className="mt-4">
            <Link
              to={compareHref}
              className="btn btn-sm"
            >
              Compare title by title
            </Link>
          </p>
        </section>
      )}

      {split && split.onlyTheirs.length > 0 && (
        <section className="panel mt-3 p-5">
          <h2 className="caption caption-corner !mb-2">Ask them about</h2>
          <p className="mb-3 max-w-xl text-sm text-ink-dim">
            The {split.onlyTheirs.length} they have seen and you have not, oldest first.
          </p>
          <ul>
            {split.onlyTheirs.slice(0, 12).map((movie) => (
              <li key={movie.id}>
                <Link
                  to={`/movies/${movie.id}`}
                  className="block truncate py-1 text-sm font-medium text-ink hover:underline hover:underline-offset-2"
                >
                  {movie.title}
                </Link>
              </li>
            ))}
          </ul>
          {split.onlyTheirs.length > 12 && (
            <p className="mt-3">
              <Link
                to={compareHref}
                className="label text-ink underline underline-offset-4 hover:decoration-2"
              >
                And {split.onlyTheirs.length - 12} more
              </Link>
            </p>
          )}
        </section>
      )}

      <section className="panel mt-3 p-5">
        <h2 className="caption caption-corner">Where they are in each saga</h2>
        <ul>
          {sagas.map(({ saga, ids }) => (
            <SagaRow
              key={saga}
              label={SAGA_LABEL[saga] ?? saga}
              movieIds={ids}
              progress={theirs}
              tint="var(--color-multiverse)"
            />
          ))}
        </ul>
      </section>
    </div>
  )
}
