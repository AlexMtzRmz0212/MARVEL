import { useState } from 'react'
import { Link } from 'react-router'

import { useMovies } from '../../api/catalog'
import {
  codeFromInput,
  formatFriendCode,
  useAcceptFriendRequest,
  useDismissFriendRequest,
  useFriendCode,
  useFriendRequests,
  useFriends,
  useRemoveFriend,
  useRotateFriendCode,
  useSendFriendRequest,
} from '../../api/friends'
import { useAuth } from '../../auth/AuthContext'
import { ProgressBar } from '../../components/WatchToggle'
import { ErrorState, LoadingState } from '../../components/states'
import { MAX_COMPARE_FRIENDS, friendIdsParam, toggleFriendId } from '../../lib/friendSelection'

/**
 * Friends: your code, the requests either way, and who you have.
 *
 * The whole feature rests on one decision, which is that two accounts find each
 * other by a code rather than by email or a public handle. Either of those would
 * make every account enumerable, and `app/services/friends.py` argues it out.
 * What matters here is that the code is the first thing on the page: it is the
 * only piece of this feature a person has to actually do something with, and
 * burying it under a friends list nobody has yet would be a page that opens on
 * its own empty state.
 *
 * The other decision visible here is that a request is a handshake. Nothing is
 * disclosed until it is accepted, so the incoming list is the only place consent
 * is given and it sits above the friends list rather than in a badge.
 *
 * Selecting people to compare happens on this page rather than only on the
 * compare page, because this is where you can see who you have. The selection
 * travels in the URL (`lib/friendSelection`), so the compare page picks it up
 * as a place rather than as handed-over state.
 */

function SignInWall() {
  return (
    <div className="py-8">
      <div className="pb-6">
        <h1 className="display text-5xl text-ink sm:text-6xl">Friends</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Swap codes with someone, then put your watch histories side by side.
        </p>
      </div>
      <p className="max-w-xl py-10 text-sm text-ink-dim">
        Friends need an account on both sides, so this is the one part of the app that does not
        work signed out. Everything else still does: your progress lives in this browser until
        you want it somewhere else.{' '}
        <Link to="/login" className="font-semibold text-ink underline underline-offset-4 hover:decoration-2">
          Sign in
        </Link>{' '}
        or{' '}
        <Link to="/register" className="font-semibold text-ink underline underline-offset-4 hover:decoration-2">
          create an account
        </Link>
        .
      </p>
      <p>
        <Link
          to="/progress/compare"
          className="label text-ink underline underline-offset-4 hover:decoration-2"
        >
          Compare with a link instead
        </Link>
      </p>
    </div>
  )
}

/** "peter@example.com" has to read as somebody in a list of people. */
function nameOf(person) {
  return person.display_name || 'Someone'
}

/**
 * "Compare with MJ" for one, a count for several.
 *
 * Naming one person is worth doing because it confirms which tick was
 * registered; naming four would be a button wider than the column it sits in.
 */
function compareLabel(friends, selected) {
  if (selected.length === 0) return 'Compare'
  if (selected.length > 1) return `Compare with ${selected.length} friends`
  const only = friends.find((friend) => friend.user_id === selected[0])
  return only ? `Compare with ${nameOf(only)}` : 'Compare'
}

/**
 * The code you hand out.
 *
 * Shown in full rather than behind a reveal. It is not a secret in the sense a
 * password is: the most somebody holding it can do is ask, and the asking has to
 * be accepted. Hiding it would imply a risk that is not there and would cost the
 * one interaction this section exists for.
 */
function YourCode() {
  const { data, isPending, error } = useFriendCode()
  const rotate = useRotateFriendCode()
  const [copied, setCopied] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)

  if (isPending) return <p className="meta">Loading your code&hellip;</p>
  if (error) return <p className="text-sm text-ink-dim">Your code could not be loaded just now.</p>

  const code = formatFriendCode(data.code)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright. The code is on screen and
      // selectable, which is the fallback, so there is nothing to report.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* A `p`, not an `output`. `output` carries an implicit live region, so
         * a screen reader would announce the code the moment the page settled,
         * over the heading that explains what it is. Nothing here is the result
         * of a calculation the reader is waiting on. */}
        <p className="panel display px-4 py-2 text-3xl tracking-[0.08em] text-ink">
          {code}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy your friend code"
          className="btn btn-sm"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span role="status" className="sr-only">
          {copied ? 'Copied to the clipboard' : ''}
        </span>
      </div>

      <p className="max-w-md text-sm text-ink-dim">
        Give this to someone and they can send you a friend request. On its own it shows them
        nothing, not even that the account exists, until you accept.
      </p>

      {confirmingRotate ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-ink-dim">
            A new code stops the old one working for anyone still holding it. Friends you already
            have are not affected.
          </p>
          <button
            type="button"
            onClick={() => {
              rotate.mutate(undefined, { onSettled: () => setConfirmingRotate(false) })
            }}
            disabled={rotate.isPending}
            className="btn btn-sm"
          >
            {rotate.isPending ? 'Replacing…' : 'Replace it'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingRotate(false)}
            className="label text-ink underline underline-offset-4 hover:decoration-2"
          >
            Keep the current code
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingRotate(true)}
          className="label self-start text-ink underline underline-offset-4 hover:decoration-2"
        >
          Replace with a new code
        </button>
      )}
    </div>
  )
}

/**
 * Paste theirs.
 *
 * The outcome line matters more than it looks: sending a code can produce a
 * friendship rather than a request, when the other person has already sent one
 * the other way. Saying "request sent" in that case would send somebody looking
 * for a pending request that does not exist.
 */
function AddFriend() {
  const [value, setValue] = useState('')
  const send = useSendFriendRequest()

  function submit(event) {
    event.preventDefault()
    const code = codeFromInput(value)
    if (!code) return
    send.mutate(code, { onSuccess: () => setValue('') })
  }

  const outcome = send.data

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            send.reset()
          }}
          name="friend_code"
          placeholder="ABCDE-FGHJK…"
          aria-label="Their friend code"
          aria-invalid={Boolean(send.error)}
          autoComplete="off"
          spellCheck="false"
          className="field min-w-0 flex-1 uppercase tracking-[0.1em] placeholder:normal-case placeholder:tracking-normal"
        />
        <button
          type="submit"
          disabled={send.isPending}
          className="btn btn-sm"
        >
          {send.isPending ? 'Sending…' : 'Send request'}
        </button>
      </form>

      {send.error && (
        <p className="text-sm text-danger">
          {send.error.status === 404
            ? 'No account has that code. Check it with them; codes can be replaced.'
            : (send.error.message ?? 'The request could not be sent.')}
        </p>
      )}

      {outcome && (
        <p className="break-words text-sm font-semibold text-ok">
          {outcome.status === 'accepted'
            ? `${nameOf(outcome)} had already sent you a request, so you are now friends.`
            : `Request sent to ${nameOf(outcome)}. They will see it next time they open the app.`}
        </p>
      )}
    </div>
  )
}

function RequestRow({ person, children }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline py-3 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{nameOf(person)}</span>
      {children}
    </li>
  )
}

function Requests() {
  const { data, isPending } = useFriendRequests()
  const accept = useAcceptFriendRequest()
  const dismiss = useDismissFriendRequest()

  if (isPending || !data) return null
  if (data.incoming.length === 0 && data.outgoing.length === 0) return null

  return (
    <>
      {data.incoming.length > 0 && (
        <section className="panel mt-3 p-5">
          <h2 className="caption caption-corner !mb-2">Waiting on you</h2>
          <p className="mb-3 max-w-xl text-sm text-ink-dim">
            Accepting lets them see which titles you have marked watched, and you see theirs.
            Nothing else is shared, and you can undo it at any time.
          </p>
          <ul>
            {data.incoming.map((person) => (
              <RequestRow key={person.user_id} person={person}>
                <button
                  type="button"
                  onClick={() => accept.mutate(person.user_id)}
                  className="btn btn-sm btn-primary"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => dismiss.mutate(person.user_id)}
                  className="label text-danger underline underline-offset-4 hover:decoration-2"
                >
                  Decline
                </button>
              </RequestRow>
            ))}
          </ul>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className="panel mt-3 p-5">
          <h2 className="caption caption-corner">Waiting on them</h2>
          <ul>
            {data.outgoing.map((person) => (
              <RequestRow key={person.user_id} person={person}>
                <span className="meta shrink-0">Sent</span>
                <button
                  type="button"
                  onClick={() => dismiss.mutate(person.user_id)}
                  className="label text-danger underline underline-offset-4 hover:decoration-2"
                >
                  Cancel
                </button>
              </RequestRow>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * One friend: how far through they are, and whether they are in the comparison.
 *
 * The percentage is computed here from `watched_count` and the catalogue size
 * rather than sent by the server, because the server has no opinion about which
 * titles count. That is a catalogue question and the catalogue is already loaded.
 */
function FriendRow({ friend, total, selected, onToggle, atCapacity }) {
  const remove = useRemoveFriend()
  const [confirming, setConfirming] = useState(false)
  // The catalogue is a separate request and may not have landed yet. Until it
  // does there is no denominator, so the count is shown on its own rather than
  // as "2/0 · 0%", which is not a slower answer but a wrong one.
  const percent = total ? Math.round((friend.watched_count / total) * 100) : 0
  const name = nameOf(friend)

  return (
    <li className="border-b border-hairline py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <label className="-m-2.5 grid size-10 shrink-0 cursor-pointer place-items-center has-[:disabled]:cursor-not-allowed">
          <input
            type="checkbox"
            name="compare"
            checked={selected}
            disabled={!selected && atCapacity}
            onChange={() => onToggle(friend.user_id)}
            aria-label={`Compare with ${name}`}
            className="size-5 accent-[var(--color-ink)] disabled:cursor-not-allowed"
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <Link
              to={`/friends/${friend.user_id}`}
              className="truncate text-sm text-ink underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
            >
              {name}
            </Link>
            <span className="meta shrink-0 tabular-nums">
              {total ? `${friend.watched_count} of ${total}, ${percent}%` : `${friend.watched_count} watched`}
            </span>
          </div>
          <ProgressBar percent={percent} />
        </div>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => remove.mutate(friend.user_id)}
              className="label text-danger underline underline-offset-4"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="label text-ink underline underline-offset-4 hover:decoration-2"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${name} from your friends`}
            className="label shrink-0 text-danger underline underline-offset-4 hover:decoration-2"
          >
            Remove
          </button>
        )}
      </div>

      {confirming && (
        <p className="mt-2 break-words pl-6 text-sm text-ink-dim">
          Removing {name} ends it for both of you, and neither of you keeps seeing the other&rsquo;s
          progress. Either of you can ask again afterwards.
        </p>
      )}
    </li>
  )
}

export function FriendsPage() {
  const { user } = useAuth()
  const friends = useFriends()
  const { data: movies } = useMovies({ order: 'release' })
  const [selected, setSelected] = useState([])

  if (!user) return <SignInWall />

  const total = movies?.length ?? 0
  const atCapacity = selected.length >= MAX_COMPARE_FRIENDS
  const known = new Set((friends.data ?? []).map((friend) => friend.user_id))
  // A friend removed while selected must not keep occupying a slot.
  const live = selected.filter((id) => known.has(id))

  return (
    <div className="py-8">
      <div className="pb-6">
        <h1 className="display text-5xl text-ink sm:text-6xl">Friends</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-dim">
          Swap codes with someone and you can see how far through the catalogue they are, and
          which titles neither of you has got to yet.
        </p>
      </div>

      <section className="panel mt-3 p-5">
        <h2 className="caption caption-corner">Your code</h2>
        <YourCode />
      </section>

      <section className="panel mt-3 p-5">
        <h2 className="caption caption-corner">Add a friend</h2>
        <AddFriend />
      </section>

      <Requests />

      <section className="panel mt-3 p-5">
        <h2 className="caption caption-corner">Your friends</h2>

        {friends.isPending && <LoadingState label="Loading friends" />}
        {friends.error && <ErrorState error={friends.error} onRetry={friends.refetch} />}

        {friends.data?.length === 0 && (
          <p className="max-w-xl py-6 text-sm text-ink-faint">
            Nobody yet. Send someone your code above, or paste theirs, and they will appear here
            once you have both said yes.
          </p>
        )}

        {friends.data?.length > 0 && (
          <>
            <ul className="mb-4">
              {friends.data.map((friend) => (
                <FriendRow
                  key={friend.user_id}
                  friend={friend}
                  total={total}
                  selected={live.includes(friend.user_id)}
                  atCapacity={atCapacity}
                  onToggle={(id) => setSelected((current) => toggleFriendId(current, id))}
                />
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                to={`/progress/compare?friends=${friendIdsParam(live)}`}
                aria-disabled={live.length === 0}
                onClick={(event) => {
                  if (live.length === 0) event.preventDefault()
                }}
                className={`btn btn-primary ${live.length === 0 ? 'pointer-events-none' : ''}`}
              >
                {compareLabel(friends.data, live)}
              </Link>
              <p className="text-sm text-ink-dim">
                {atCapacity
                  ? `Four at once is the limit, so every row still fits on a phone.`
                  : `Tick up to ${MAX_COMPARE_FRIENDS} people to put side by side.`}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
