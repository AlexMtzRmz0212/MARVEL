import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useMovies } from '../../api/catalog'
import { useFriends, useFriendsProgress } from '../../api/friends'
import {
  tokenFromInput,
  useCreateShareLink,
  useMyShareLink,
  useRevokeShareLink,
  useSharedProgress,
} from '../../api/share'
import { useAuth } from '../../auth/AuthContext'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { useWatchProgress } from '../../hooks/useWatchProgress'
import { formatTotalRuntime } from '../../lib/format'
import {
  MAX_COMPARE_FRIENDS,
  friendIdsParam,
  parseFriendIds,
  toggleFriendId,
} from '../../lib/friendSelection'
import { isWatched, progressFor } from '../../lib/watchStorage'

/**
 * Several people's progress against the same catalogue.
 *
 * The `/compare` page puts the two canonical *orderings* side by side; this one
 * holds the ordering still and puts *viewers* side by side. What it is for is
 * the difference: what you have all seen, what only one of you has, and -- the
 * question people actually ask each other -- what none of you has yet.
 *
 * A single list with a mark per person per row rather than mirrored columns.
 * Everybody holds the same titles in the same order here, so a second column of
 * identical labels would repeat itself, and the thread between them would be a
 * hundred and twenty-eight flat lines carrying no information at all. The row
 * idiom is `features/compare/OrderColumn` all the same: one fixed height, a
 * hairline spine, a dot, a position, a truncated title.
 *
 * **Two ways in, one comparison.** A friend is picked from a list; anybody else
 * arrives as a share link. They differ entirely in how consent was given and not
 * at all in what comes back -- a display name and a set of watched ids -- so
 * below the `others` array they are the same thing and nothing downstream knows
 * which is which.
 *
 * Everything here still works signed out. A guest cannot have friends and cannot
 * hand out a link, because their progress never leaves their browser and there
 * is nothing on the server to share. They can still follow one, and compare it
 * against what is in front of them. Refusing that would be a locked door with
 * nothing behind it.
 */

/** Matching `features/compare/ComparePage`, and for the same reasons. */
const ROW = 30

const FILTERS = ['all', 'both', 'you', 'them', 'neither']

/**
 * The four buckets, worded for however many people are being compared.
 *
 * The keys never change and the partition never changes; only the labels do.
 * With one other person `them` means "only them", and with several it means
 * "some but not all of you", which is the same branch of the same ternary --
 * `both` is everyone, `neither` is nobody, `you` is you alone, and `them` is
 * everything left over. Generalising the wording rather than the logic is what
 * keeps the two-person case reading exactly as it always did.
 */
function bucketsFor(count) {
  const several = count > 1
  return {
    both: {
      label: several ? 'Everyone' : 'Both',
      blurb: several ? 'all of you have seen it' : 'you have both seen it',
    },
    you: {
      label: 'Only you',
      blurb: several ? 'nobody else has seen it' : 'you have seen it, they have not',
    },
    them: {
      label: several ? 'Some of you' : 'Only them',
      blurb: several ? 'seen by some but not all of you' : 'they have seen it, you have not',
    },
    neither: {
      label: several ? 'Nobody' : 'Neither',
      blurb: several ? 'still ahead of all of you' : 'still ahead of both of you',
    },
  }
}

/**
 * Their watched ids, in the shape every existing helper already reads.
 *
 * `isWatched` and `progressFor` both test `progress[id].watched_at` for truth
 * and nothing else, so a bare `true` is enough and no timestamp is invented.
 * This adapter is the only glue the feature needs, for either source.
 */
function asProgressMap(watchedIds) {
  return Object.fromEntries((watchedIds ?? []).map((id) => [id, { watched_at: true }]))
}

/**
 * One filled dot means watched.
 *
 * Never the only signal: every row carries the bucket in words as well, because
 * small circles differing by fill is precisely the distinction a colourblind or
 * low-vision reader loses.
 */
function Mark({ on }) {
  return (
    <span
      aria-hidden="true"
      className={`size-1.5 shrink-0 rounded-full ${on ? '' : 'border border-hairline-strong'}`}
      style={on ? { backgroundColor: 'var(--color-ok)' } : undefined}
    />
  )
}

function Chip({ active, disabled, children, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      // max-w + truncate because a chip can carry a display name, and a display
      // name is 80 characters of whatever somebody typed. A flex-wrap row wraps
      // chips but cannot shrink one, so without this a single long name is a
      // horizontal scrollbar on the whole document.
      className={`label max-w-[10rem] truncate border px-2 py-0.5 text-[0.6875rem] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'border-ink-dim text-ink'
          : 'border-hairline-strong text-ink-faint hover:text-ink-dim'
      }`}
    >
      {children}
    </button>
  )
}

/** A headline figure and its bar, one per person. */
function Side({ name, stats, runtime }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-ink">{name}</span>
        <span className="meta shrink-0 tabular-nums">
          {stats.watched}/{stats.total} · {stats.percent}%
        </span>
      </div>
      <ProgressBar percent={stats.percent} />
      {runtime > 0 && <p className="meta mt-1.5">{formatTotalRuntime(runtime)} watched</p>}
    </div>
  )
}

/**
 * Pick which friends are in the comparison.
 *
 * The same selection the friends page offers, in the place where adjusting it is
 * natural. Both write `?friends=` and neither holds state of its own, so
 * arriving here from a friend's profile, from the friends list, or from a
 * bookmark are the same thing.
 */
function FriendPicker({ selected, onToggle }) {
  const { user } = useAuth()
  const { data: friends, isPending } = useFriends()

  // No sign-in link here, deliberately, even though this is a signed-out state.
  // The section immediately below already carries one, and two of them a few
  // lines apart reads as the page nagging rather than explaining. This says what
  // is missing; that one offers the way out of it.
  if (!user) {
    return (
      <p className="text-sm text-ink-dim">
        Friends need an account on both sides, so this is empty until you sign in. A link works
        either way and is right below.
      </p>
    )
  }

  if (isPending) return <p className="meta">Loading friends&hellip;</p>

  if (!friends?.length) {
    return (
      <p className="text-sm text-ink-dim">
        No friends yet.{' '}
        <Link to="/friends" className="text-ink underline underline-offset-4">
          Swap codes with someone
        </Link>{' '}
        and they will show up here, or use a link below.
      </p>
    )
  }

  const atCapacity = selected.length >= MAX_COMPARE_FRIENDS

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {friends.map((friend) => {
          const active = selected.includes(friend.user_id)
          return (
            <Chip
              key={friend.user_id}
              active={active}
              disabled={!active && atCapacity}
              onClick={() => onToggle(friend.user_id)}
            >
              {friend.display_name || 'Someone'}
            </Chip>
          )
        })}
      </div>
      <p className="text-xs text-ink-faint">
        {atCapacity
          ? `${MAX_COMPARE_FRIENDS} at once is the limit, so every row still fits on a phone.`
          : `Pick up to ${MAX_COMPARE_FRIENDS}.`}
      </p>
    </div>
  )
}

/**
 * The link you hand out.
 *
 * The warning sits next to the button rather than under the fold. Generating a
 * capability URL is the one action on this page that discloses anything, and
 * somebody should not have to go looking for what it discloses.
 */
function YourLink() {
  const { user } = useAuth()
  const { data, isPending } = useMyShareLink()
  const create = useCreateShareLink()
  const revoke = useRevokeShareLink()
  const [copied, setCopied] = useState(false)

  if (!user) {
    return (
      <p className="text-sm text-ink-dim">
        Your progress is saved in this browser only, so there is nothing to share yet.{' '}
        <Link to="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>{' '}
        to get a link. You can still follow someone else&rsquo;s below.
      </p>
    )
  }

  const token = data?.token ?? null
  const url = token ? `${window.location.origin}/progress/compare?with=${token}` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright. The input below is selectable,
      // which is the fallback, so there is nothing to report.
    }
  }

  if (isPending) return <p className="meta">Checking&hellip;</p>

  if (!token) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="label border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
        >
          {create.isPending ? 'Creating…' : 'Create a link'}
        </button>
        <p className="max-w-md text-xs text-ink-faint">
          Anyone holding the link can see your display name and which titles you have marked
          watched. Not your email, your ratings or your notes. You can revoke it at any time.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Your share link"
          onFocus={(event) => event.target.select()}
          className="hairline min-w-0 flex-1 border bg-surface px-2 py-1.5 font-mono text-xs text-ink-dim"
        />
        <button
          type="button"
          onClick={copy}
          className="label border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => create.mutate()}
          className="label text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
        >
          Replace with a new link
        </button>
        <button
          type="button"
          onClick={() => revoke.mutate()}
          className="label text-ink-faint underline underline-offset-4 transition-colors hover:text-danger"
        >
          Revoke
        </button>
        <p className="text-xs text-ink-faint">
          Replacing or revoking stops the old link working immediately.
        </p>
      </div>
    </div>
  )
}

/** Paste theirs. Takes a whole URL or a bare token; see `tokenFromInput`. */
function TheirLink({ onFollow, current }) {
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)

  function submit(event) {
    event.preventDefault()
    const token = tokenFromInput(value)
    if (!token) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onFollow(token)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setInvalid(false)
          }}
          placeholder="Paste their link"
          aria-label="Their share link"
          aria-invalid={invalid}
          className="hairline min-w-0 flex-1 border bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="submit"
          className="label border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
        >
          {current ? 'Switch' : 'Compare'}
        </button>
      </div>
      {invalid && <p className="text-xs text-danger">That does not look like a share link.</p>}
    </form>
  )
}

/**
 * The column headings over the marks.
 *
 * Two densities, because two and five people are not the same problem. With one
 * other person there is room to write both names over their columns, which is
 * what the page has always done. With more, a name will not fit in a column
 * wide enough only for a dot, so the columns are numbered and a legend above
 * says who is who. Numbering rather than initials: two friends called Ned and
 * Natasha would both be "N", and a heading that is ambiguous is worse than one
 * that is merely indirect.
 */
function MarkHeadings({ names }) {
  const numbered = names.length > 2

  return (
    <>
      {numbered && (
        <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 pl-3">
          {names.map((name, index) => (
            <span key={name + index} className="meta max-w-[12rem] truncate">
              {index + 1} {name}
            </span>
          ))}
        </p>
      )}
      <div className="flex items-center gap-1.5 pb-1 pl-3">
        <span className="meta w-6 text-right text-[0.625rem]">#</span>
        {names.map((name, index) => (
          <span
            key={name + index}
            className="meta w-7 truncate text-center text-[0.625rem]"
            title={name}
          >
            {numbered ? index + 1 : name}
          </span>
        ))}
        <span className="meta text-[0.625rem]">Title</span>
      </div>
    </>
  )
}

export function CompareProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('with') ?? ''
  // Memoised on the raw parameter rather than recomputed each render: the array
  // is a dependency of the two passes below, and a fresh one every render would
  // make both of their memos worthless.
  const friendsParam = searchParams.get('friends') ?? ''
  const friendIds = useMemo(() => parseFriendIds(friendsParam), [friendsParam])

  const { data: movies, isPending, error, refetch } = useMovies({ order: 'release' })
  const mine = useWatchProgress()
  const shared = useSharedProgress(token)
  const friendsProgress = useFriendsProgress()

  const [filter, setFilter] = useState('all')

  /**
   * Everybody in the comparison except you, in the order the columns take.
   *
   * Friends first and in the order the URL names them, so the columns do not
   * reshuffle when one friend's row arrives before another's. A friend id that
   * resolves to nothing is dropped rather than rendered blank: a bookmarked
   * comparison should survive one of its friendships ending.
   */
  const others = useMemo(() => {
    const list = []
    for (const id of friendIds) {
      const row = friendsProgress.data?.find((friend) => friend.user_id === id)
      if (!row) continue
      list.push({
        key: id,
        name: row.display_name || 'Someone',
        progress: asProgressMap(row.watched_ids),
      })
    }
    if (token && shared.data) {
      list.push({
        key: 'link',
        name: shared.data.display_name || 'Them',
        progress: asProgressMap(shared.data.watched_ids),
      })
    }
    return list
  }, [friendIds, friendsProgress.data, shared.data, token])

  const buckets = bucketsFor(others.length)

  // One pass over the catalogue gives the rows and the four counts together; the
  // filter below is a view of it, so switching filters recomputes nothing.
  const model = useMemo(() => {
    if (!movies || others.length === 0) return null

    const counts = { both: 0, you: 0, them: 0, neither: 0 }
    const rows = movies.map((movie, index) => {
      const yours = isWatched(mine, movie.id)
      const marks = others.map((other) => isWatched(other.progress, movie.id))
      const anyOther = marks.some(Boolean)
      const allOthers = marks.every(Boolean)

      // Everyone, nobody, you alone, or anything left over. At one other person
      // "left over" is exactly "only them", which is why the two-person wording
      // still reads correctly off the same branch.
      //
      // The third test is `yours && !anyOther`, not `yours`. With one other
      // person the two are the same -- failing the first test already means
      // they have not seen it -- so the shorter form passes every two-person
      // case and then files a title you and one of three friends have seen
      // under "only you". Which is what the many-person test is for.
      const bucket =
        yours && allOthers
          ? 'both'
          : !yours && !anyOther
            ? 'neither'
            : yours && !anyOther
              ? 'you'
              : 'them'
      counts[bucket] += 1
      return { movie, index, yours, marks, bucket }
    })

    return { rows, counts }
  }, [movies, mine, others])

  function setSelection(ids) {
    const next = {}
    if (ids.length) next.friends = friendIdsParam(ids)
    if (token) next.with = token
    setFilter('all')
    setSearchParams(next)
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <LoadingState label="Loading catalog" />

  const allIds = movies.map((movie) => movie.id)
  const runtimeOf = (progress) =>
    movies.reduce(
      (sum, movie) => sum + (isWatched(progress, movie.id) ? (movie.runtime_min ?? 0) : 0),
      0,
    )

  const names = ['You', ...others.map((other) => other.name)]
  const visible =
    filter === 'all' || !model ? (model?.rows ?? []) : model.rows.filter((row) => row.bucket === filter)
  const neitherIds = (model?.rows ?? [])
    .filter((row) => row.bucket === 'neither')
    .map((row) => row.movie.id)
  // "Watching with MJ" reads properly for one person and badly for four, so the
  // name is only used when there is one name to use.
  const orderName =
    others.length === 1 ? `Watching with ${others[0].name}` : `Watching with ${others.length} others`

  return (
    <div className="py-8">
      <div className="hairline border-b pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Compare progress</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Put your watch history against your friends&rsquo; on the same catalogue. What you have
          all seen, what only one of you has, and what is still ahead of everybody, which is the
          list worth starting from tonight.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <Link
            to="/progress"
            className="label text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
          >
            Back to your progress
          </Link>
          <Link
            to="/friends"
            className="label text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
          >
            Manage friends
          </Link>
        </p>
      </div>

      <section className="hairline border-b py-6">
        <h2 className="meta mb-3">Compare with</h2>
        <FriendPicker
          selected={friendIds}
          onToggle={(id) => setSelection(toggleFriendId(friendIds, id))}
        />
      </section>

      <section className="hairline border-b py-6">
        <h2 className="meta mb-3">Your link</h2>
        <YourLink />
      </section>

      <section className="hairline border-b py-6">
        <h2 className="meta mb-3">{token ? 'Comparing with a link' : 'Their link'}</h2>
        <TheirLink
          current={token}
          onFollow={(next) => {
            setFilter('all')
            setSearchParams(
              friendIds.length ? { friends: friendIdsParam(friendIds), with: next } : { with: next },
            )
          }}
        />
      </section>

      {token && shared.isPending && <LoadingState label="Loading their progress" />}

      {token && shared.error && (
        <div className="py-10">
          <p className="text-sm text-ink-dim">
            {shared.error.status === 404
              ? 'That link does not work any more. It may have been revoked or replaced, so ask them for a new one.'
              : 'Their progress could not be loaded just now.'}
          </p>
          <button
            type="button"
            onClick={() =>
              setSearchParams(friendIds.length ? { friends: friendIdsParam(friendIds) } : {})
            }
            className="label mt-3 text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
          >
            Clear the link
          </button>
        </div>
      )}

      {others.length === 0 && !(token && (shared.isPending || shared.error)) && (
        <p className="py-10 text-sm text-ink-faint">
          Pick a friend above, or paste a link, to see the comparison.
        </p>
      )}

      {model && (
        <>
          <section className="hairline grid gap-8 border-b py-6 sm:grid-cols-2 lg:grid-cols-3">
            <Side name="You" stats={progressFor(mine, allIds)} runtime={runtimeOf(mine)} />
            {others.map((other) => (
              <Side
                key={other.key}
                name={other.name}
                stats={progressFor(other.progress, allIds)}
                runtime={runtimeOf(other.progress)}
              />
            ))}
          </section>

          <section className="hairline border-b py-6">
            <h2 className="meta mb-3">The difference</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {FILTERS.filter((key) => key !== 'all').map((key) => (
                <div key={key}>
                  <dt className="meta">{buckets[key].label}</dt>
                  <dd className="text-lg tabular-nums text-ink">{model.counts[key]}</dd>
                  <dd className="mt-0.5 text-xs text-ink-faint">{buckets[key].blurb}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="py-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {FILTERS.map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key === 'all' ? `All ${model.rows.length}` : buckets[key].label}
                </Chip>
              ))}
            </div>

            {/* The "nobody" filter is the watch-together list, so it does not
             * need a section of its own, only somewhere to go next. */}
            {filter === 'neither' && neitherIds.length > 0 && (
              <p className="mb-4">
                <Link
                  to={`/orders/new?name=${encodeURIComponent(orderName)}&start=${neitherIds.join(',')}`}
                  className="label border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
                >
                  Build an order from these {neitherIds.length}
                </Link>
              </p>
            )}

            <div className="relative min-w-0">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-hairline" />

              <MarkHeadings names={names} />

              {visible.length === 0 ? (
                <p className="py-6 pl-3 text-sm text-ink-faint">
                  Nothing in this group. {buckets[filter]?.blurb ?? ''}
                </p>
              ) : (
                <ol>
                  {visible.map(({ movie, index, yours, marks, bucket }) => (
                    <li key={movie.id} style={{ height: ROW }}>
                      <Link
                        to={`/movies/${movie.id}`}
                        data-row={movie.id}
                        className="flex h-full w-full items-center gap-1.5 pl-3 transition-colors hover:bg-surface"
                      >
                        <span className="meta w-6 shrink-0 text-right text-[0.625rem] tabular-nums">
                          {index + 1}
                        </span>
                        {[yours, ...marks].map((on, column) => (
                          <span
                            key={names[column] + column}
                            className="flex w-7 shrink-0 justify-center"
                          >
                            <Mark on={on} />
                          </span>
                        ))}
                        <span
                          className={`min-w-0 flex-1 truncate text-[0.8125rem] ${
                            bucket === 'neither' ? 'text-ink-dim' : 'text-ink-faint'
                          }`}
                        >
                          {movie.title}
                        </span>
                        {/* The marks differ only by fill, which is exactly the
                         * distinction a low-vision reader loses, so the bucket
                         * is always in the accessible name. It is only *drawn*
                         * where there is room for it. */}
                        <span className="meta hidden shrink-0 pr-1 text-[0.625rem] sm:block">
                          {buckets[bucket].label}
                        </span>
                        <span className="sr-only sm:hidden">{buckets[bucket].label}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
