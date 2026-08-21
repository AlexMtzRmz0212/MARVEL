import { useState } from 'react'

import { Button, Field, Problems, Segmented, Select, TextInput } from './ui'

/**
 * The graph itself, edited one title at a time from both ends.
 *
 * An edge is stored on the title that *depends*, which makes "what does this
 * unlock?" invisible in the file — you can only answer it by sweeping the whole
 * catalog. So this panel shows both directions and lets you edit either, and
 * every control writes to whichever title actually owns the edge.
 *
 * Changes here commit immediately. A single edge toggle leaves no form open to
 * correct, so an invalid one is refused by the server and simply never lands.
 */

/** Every (owner, edge) pair pointing at `id` — the titles it unlocks. */
function dependentsOf(movies, id) {
  return movies.flatMap((movie) =>
    (movie.prerequisites ?? [])
      .filter((edge) => edge.id === id)
      .map((edge) => ({ owner: movie, edge })),
  )
}

const yearOf = (movie) => (movie?.release_date ?? '').slice(0, 4) || '—'
const labelOf = (movie) => `${movie.title} (${yearOf(movie)})`

/**
 * One connection, from the point of view of whichever title is in focus.
 *
 * `owner` always holds the edge and `other` is the title at its far end, so the
 * same row renders both directions and every control still edits `owner`.
 */
function EdgeRow({ owner, edge, other, strengths, onChange, onCut, disabled }) {
  const [note, setNote] = useState(edge.note ?? '')

  return (
    <li className="hairline border bg-base p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">{other.title}</p>
          <p className="meta truncate">
            {yearOf(other)} · {other.id}
          </p>
        </div>
        <Button
          tone="danger"
          disabled={disabled}
          onClick={() => onCut(owner.id, edge.id)}
          aria-label={`Disconnect ${other.title}`}
        >
          ✕
        </Button>
      </div>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[10rem_1fr]">
        <Segmented
          name={`strength for ${other.title}`}
          options={strengths}
          value={edge.strength}
          onChange={(strength) => onChange(owner.id, edge.id, { strength })}
        />
        <TextInput
          value={note}
          placeholder="why, in one line (optional)"
          onChange={(event) => setNote(event.target.value)}
          // On blur rather than on every keystroke: each commit is a full
          // validate-and-write of the file, and typing a sentence should not be
          // thirty of them.
          onBlur={() => {
            const next = note.trim() || null
            if (next !== (edge.note ?? null)) onChange(owner.id, edge.id, { note: next })
          }}
        />
      </div>
    </li>
  )
}

function ConnectForm({ eligible, movies, strengths, emptyHint, label, onConnect, disabled }) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [strength, setStrength] = useState('essential')
  const [note, setNote] = useState('')

  if (eligible.length === 0) return <p className="meta normal-case tracking-normal">{emptyHint}</p>

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        {label}
      </Button>
    )
  }

  const byId = new Map(movies.map((movie) => [movie.id, movie]))

  return (
    // Deliberately not a <form>: a form submits on Enter, so picking a title
    // with the keyboard would write an edge with whatever strength and note
    // happened to be sitting there — a connection nobody asked for.
    <div className="hairline space-y-2 border border-dashed p-2">
      <Field label="Title">
        <Select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          options={[
            { value: '', label: '— pick one —' },
            ...eligible.map((id) => ({ value: id, label: labelOf(byId.get(id)) })),
          ]}
        />
      </Field>
      <Field label="Strength">
        <Segmented name="strength" options={strengths} value={strength} onChange={setStrength} />
      </Field>
      <Field label="Note">
        <TextInput
          value={note}
          placeholder="why, in one line (optional)"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!choice || disabled}
          onClick={async () => {
            const ok = await onConnect(choice, strength, note.trim() || null)
            if (!ok) return
            setChoice('')
            setNote('')
            setStrength('essential')
            setOpen(false)
          }}
        >
          Connect
        </Button>
      </div>
    </div>
  )
}

export function Dependencies({ movies, enums, warnings, problems, saving, focusId, onFocus, onEdit }) {
  const focus = movies.find((movie) => movie.id === focusId) ?? movies[0]
  if (!focus) return <p className="meta py-8 text-center">Add a title first.</p>

  const index = movies.indexOf(focus)
  const requires = focus.prerequisites ?? []
  const dependents = dependentsOf(movies, focus.id)
  const strengths = enums.strengths

  /** Point `ownerId` at `prerequisiteId`. */
  const connect = (ownerId, prerequisiteId, strength, note) =>
    onEdit((document) => {
      const owner = document.movies.find((movie) => movie.id === ownerId)
      owner.prerequisites = [...(owner.prerequisites ?? []), { id: prerequisiteId, strength, note }]
    })

  const cut = (ownerId, prerequisiteId) =>
    onEdit((document) => {
      const owner = document.movies.find((movie) => movie.id === ownerId)
      owner.prerequisites = owner.prerequisites.filter((edge) => edge.id !== prerequisiteId)
    })

  const change = (ownerId, prerequisiteId, patch) =>
    onEdit((document) => {
      const owner = document.movies.find((movie) => movie.id === ownerId)
      owner.prerequisites = owner.prerequisites.map((edge) =>
        edge.id === prerequisiteId ? { ...edge, ...patch } : edge,
      )
    })

  const taken = new Set(requires.map((edge) => edge.id))
  const eligibleBefore = movies
    .slice(0, index)
    .filter((movie) => !taken.has(movie.id))
    .map((movie) => movie.id)

  const claimed = new Set(dependents.map(({ owner }) => owner.id))
  const eligibleAfter = movies
    .slice(index + 1)
    .filter((movie) => !claimed.has(movie.id))
    .map((movie) => movie.id)

  // The catalog keeps its edges transitively reduced, so a warning naming the
  // focused title is worth seeing right here rather than in the status panel.
  const mine = (warnings ?? []).filter((warning) => warning.includes(focus.title))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={focus.id}
          onChange={(event) => onFocus(event.target.value)}
          className="max-w-lg"
          options={movies.map((movie, position) => ({
            value: movie.id,
            label: `${position + 1}. ${labelOf(movie)}`,
          }))}
        />
        <span className="meta">
          requires {requires.length} · unlocks {dependents.length}
        </span>
      </div>

      <Problems title="Change rejected and undone — nothing was written" lines={problems} />
      <Problems title="Worth a look" lines={mine} tone="warn" />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="meta text-ink">← Requires</h3>
          <p className="meta normal-case tracking-normal">
            Watch these first. Each edge is stored on this title.
          </p>
          <ul className="space-y-1.5">
            {requires.length === 0 && <p className="meta">Nothing yet.</p>}
            {requires.map((edge) => {
              const other = movies.find((movie) => movie.id === edge.id)
              if (!other) {
                return (
                  <li key={edge.id} className="meta text-danger">
                    Dangling prerequisite {edge.id}
                  </li>
                )
              }
              return (
                <EdgeRow
                  key={edge.id}
                  owner={focus}
                  edge={edge}
                  other={other}
                  strengths={strengths}
                  onChange={change}
                  onCut={cut}
                  disabled={saving}
                />
              )
            })}
          </ul>
          <ConnectForm
            eligible={eligibleBefore}
            movies={movies}
            strengths={strengths}
            label="Add a prerequisite"
            emptyHint="Nothing eligible — a prerequisite has to sit earlier in the timeline. Reorder first."
            disabled={saving}
            onConnect={(choice, strength, note) => connect(focus.id, choice, strength, note)}
          />
        </section>

        <section className="space-y-2">
          <h3 className="meta text-ink">Unlocks →</h3>
          <p className="meta normal-case tracking-normal">
            These depend on it. Each edge is stored on the other title.
          </p>
          <ul className="space-y-1.5">
            {dependents.length === 0 && <p className="meta">Nothing yet.</p>}
            {dependents.map(({ owner, edge }) => (
              <EdgeRow
                key={owner.id}
                owner={owner}
                edge={edge}
                other={owner}
                strengths={strengths}
                onChange={change}
                onCut={cut}
                disabled={saving}
              />
            ))}
          </ul>
          <ConnectForm
            eligible={eligibleAfter}
            movies={movies}
            strengths={strengths}
            label="Add a title that depends on this one"
            emptyHint="Nothing eligible — only titles later in the timeline can depend on this one. Reorder first."
            disabled={saving}
            onConnect={(choice, strength, note) => connect(choice, focus.id, strength, note)}
          />
        </section>
      </div>
    </div>
  )
}
