import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useMovies } from '../../api/catalog'
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
import { isWatched, progressFor } from '../../lib/watchStorage'

/**
 * Two people's progress against the same catalog.
 *
 * The `/compare` page puts the two canonical *orderings* side by side; this one
 * holds the ordering still and puts two *viewers* side by side. What it is for
 * is the difference: what you have both seen, what only one of you has, and --
 * the question people actually ask each other -- what neither of you has yet.
 *
 * A single list with two marks per row rather than two mirrored columns. Both
 * sides hold the same titles in the same order here, so a second column of
 * identical labels would repeat itself, and the thread between them would be a
 * hundred and twenty-eight flat lines carrying no information at all. The row
 * idiom is `features/compare/OrderColumn` all the same: one fixed height, a
 * hairline spine, a dot, a position, a truncated title.
 *
 * Everything below works signed out. A guest cannot hand out a link -- their
 * progress never leaves their browser, so there is nothing on the server to
 * share -- but they can follow one, and compare it against what is in front of
 * them. Refusing that would be a locked door with nothing behind it.
 */

/** Matching `features/compare/ComparePage`, and for the same reasons. */
const ROW = 30

const BUCKETS = {
  both: { label: 'Both', blurb: 'you have both seen it' },
  you: { label: 'Only you', blurb: 'you have seen it, they have not' },
  them: { label: 'Only them', blurb: 'they have seen it, you have not' },
  neither: { label: 'Neither', blurb: 'still ahead of both of you' },
}

const FILTERS = ['all', 'both', 'you', 'them', 'neither']

/**
 * Their watched ids, in the shape every existing helper already reads.
 *
 * `isWatched` and `progressFor` both test `progress[id].watched_at` for truth
 * and nothing else, so a bare `true` is enough and no timestamp is invented.
 * This adapter is the only glue the feature needs.
 */
function asProgressMap(watchedIds) {
  return Object.fromEntries((watchedIds ?? []).map((id) => [id, { watched_at: true }]))
}

/**
 * One filled dot means watched.
 *
 * Never the only signal: every row carries the bucket in words as well, because
 * two small circles differing by fill is precisely the distinction a colourblind
 * or low-vision reader loses.
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

function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`label border px-2 py-0.5 text-[0.6875rem] transition-colors ${
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
      {runtime > 0 && <p className="meta mt-1.5">{formatTotalRuntime(runtime)} behind them</p>}
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

export function CompareProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('with') ?? ''

  const { data: movies, isPending, error, refetch } = useMovies({ order: 'release' })
  const mine = useWatchProgress()
  const shared = useSharedProgress(token)

  const [filter, setFilter] = useState('all')

  const theirs = useMemo(() => asProgressMap(shared.data?.watched_ids), [shared.data])

  // One pass over the catalog gives the rows and the four counts together; the
  // filter below is a view of it, so switching filters recomputes nothing.
  const model = useMemo(() => {
    if (!movies) return null

    const counts = { both: 0, you: 0, them: 0, neither: 0 }
    const rows = movies.map((movie, index) => {
      const yours = isWatched(mine, movie.id)
      const their = isWatched(theirs, movie.id)
      const bucket = yours && their ? 'both' : yours ? 'you' : their ? 'them' : 'neither'
      counts[bucket] += 1
      return { movie, index, yours, their, bucket }
    })

    return { rows, counts }
  }, [movies, mine, theirs])

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <LoadingState label="Loading catalog" />

  const allIds = movies.map((movie) => movie.id)
  const myStats = progressFor(mine, allIds)
  const theirStats = progressFor(theirs, allIds)
  const myRuntime = movies.reduce(
    (sum, movie) => sum + (isWatched(mine, movie.id) ? (movie.runtime_min ?? 0) : 0),
    0,
  )
  const theirRuntime = movies.reduce(
    (sum, movie) => sum + (isWatched(theirs, movie.id) ? (movie.runtime_min ?? 0) : 0),
    0,
  )

  const them = shared.data?.display_name || 'Them'
  const visible = filter === 'all' ? model.rows : model.rows.filter((row) => row.bucket === filter)
  const neitherIds = model.rows.filter((row) => row.bucket === 'neither').map((row) => row.movie.id)

  return (
    <div className="py-8">
      <div className="hairline border-b pb-6">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Compare progress</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Hand someone a link and put your two watch histories against the same catalog. What you
          have both seen, what only one of you has, and what is still ahead of both of you &mdash;
          which is the list worth starting from tonight.
        </p>
        <p className="mt-3">
          <Link
            to="/progress"
            className="label text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
          >
            Back to your progress
          </Link>
        </p>
      </div>

      <section className="hairline border-b py-6">
        <h2 className="meta mb-3">Your link</h2>
        <YourLink />
      </section>

      <section className="hairline border-b py-6">
        <h2 className="meta mb-3">{token ? 'Comparing with' : 'Their link'}</h2>
        <TheirLink
          current={token}
          onFollow={(next) => {
            setFilter('all')
            setSearchParams({ with: next })
          }}
        />
      </section>

      {!token && (
        <p className="py-10 text-sm text-ink-faint">
          Paste a link above to see the comparison.
        </p>
      )}

      {token && shared.isPending && <LoadingState label="Loading their progress" />}

      {token && shared.error && (
        <div className="py-10">
          <p className="text-sm text-ink-dim">
            {shared.error.status === 404
              ? 'That link does not work any more. It may have been revoked or replaced — ask them for a new one.'
              : 'Their progress could not be loaded just now.'}
          </p>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="label mt-3 text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
          >
            Clear the link
          </button>
        </div>
      )}

      {token && shared.data && model && (
        <>
          <section className="hairline grid gap-8 border-b py-6 sm:grid-cols-2">
            <Side name="You" stats={myStats} runtime={myRuntime} />
            <Side name={them} stats={theirStats} runtime={theirRuntime} />
          </section>

          <section className="hairline border-b py-6">
            <h2 className="meta mb-3">The difference</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {FILTERS.filter((key) => key !== 'all').map((key) => (
                <div key={key}>
                  <dt className="meta">{BUCKETS[key].label}</dt>
                  <dd className="text-lg tabular-nums text-ink">{model.counts[key]}</dd>
                  <dd className="mt-0.5 text-xs text-ink-faint">{BUCKETS[key].blurb}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="py-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {FILTERS.map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key === 'all' ? `All ${model.rows.length}` : BUCKETS[key].label}
                </Chip>
              ))}
            </div>

            {/* The "Neither" filter is the watch-together list, so it does not
             * need a section of its own -- only somewhere to go next. */}
            {filter === 'neither' && neitherIds.length > 0 && (
              <p className="mb-4">
                <Link
                  to={`/orders/new?name=${encodeURIComponent(`Watching with ${them}`)}&start=${neitherIds.join(',')}`}
                  className="label border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
                >
                  Build an order from these {neitherIds.length}
                </Link>
              </p>
            )}

            <div className="relative min-w-0">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-hairline" />

              <div className="flex items-center gap-2 pb-1 pl-3">
                <span className="meta w-8 text-right text-[0.625rem]">#</span>
                <span className="meta w-8 text-center text-[0.625rem]">You</span>
                <span className="meta w-8 text-center text-[0.625rem]">Them</span>
                <span className="meta text-[0.625rem]">Title</span>
              </div>

              {visible.length === 0 ? (
                <p className="py-6 pl-3 text-sm text-ink-faint">
                  Nothing in this group. {BUCKETS[filter]?.blurb ?? ''}
                </p>
              ) : (
                <ol>
                  {visible.map(({ movie, index, yours, their, bucket }) => (
                    <li key={movie.id} style={{ height: ROW }}>
                      <Link
                        to={`/movies/${movie.id}`}
                        data-row={movie.id}
                        className="flex h-full w-full items-center gap-2 pl-3 transition-colors hover:bg-surface"
                      >
                        <span className="meta w-8 shrink-0 text-right text-[0.625rem] tabular-nums">
                          {index + 1}
                        </span>
                        <span className="flex w-8 shrink-0 justify-center">
                          <Mark on={yours} />
                        </span>
                        <span className="flex w-8 shrink-0 justify-center">
                          <Mark on={their} />
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-[0.8125rem] ${
                            bucket === 'neither' ? 'text-ink-dim' : 'text-ink-faint'
                          }`}
                        >
                          {movie.title}
                        </span>
                        {/* The two marks differ only by fill, which is exactly
                         * the distinction a low-vision reader loses, so the
                         * bucket is always in the accessible name. It is only
                         * *drawn* where there is room for it. */}
                        <span className="meta hidden shrink-0 pr-1 text-[0.625rem] sm:block">
                          {BUCKETS[bucket].label}
                        </span>
                        <span className="sr-only sm:hidden">{BUCKETS[bucket].label}</span>
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
