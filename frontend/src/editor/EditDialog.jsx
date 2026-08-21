import { useState } from 'react'

import { fetchTmdbDetails, searchTmdb } from './api'
import { Button, Dialog, Field, NumberInput, Problems, Segmented, Select, TextInput } from './ui'

/**
 * One title, edited in a focused dialog rather than a long scrolling form.
 *
 * The draft is local: nothing reaches the document until Save, so abandoning a
 * half-finished edit costs nothing and a rejected save leaves the dialog open
 * with the reasons and the work still in it.
 */

const BLANK = {
  id: '',
  title: '',
  release_date: '2008-01-01',
  phase: null,
  saga: 'N/A',
  universe: 'Earth-616',
  media_type: 'film',
  tier: 'core',
  runtime_min: null,
  poster_url: '',
  synopsis: '',
  tmdb_id: null,
  prerequisites: [],
}

/** A stored release_date coerced into something `<input type="date">` accepts.
 *  A bare year like "2011" — what the old insert flow wrote — is not a valid
 *  date, so fall back to January and let it be corrected by hand. */
function toDateInput(value) {
  if (typeof value !== 'string') return BLANK.release_date
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return /^\d{4}$/.test(value.trim()) ? `${value.trim()}-01-01` : BLANK.release_date
}

/** Empty strings and zeroes are how the form spells "absent"; the schema spells
 *  it `null`, and `gt=0` on runtime means a literal 0 is a validation error. */
function clean(draft) {
  const blank = (value) => (typeof value === 'string' ? value.trim() || null : value || null)
  return {
    ...draft,
    id: draft.id.trim(),
    title: draft.title.trim(),
    phase: draft.phase || null,
    runtime_min: Number(draft.runtime_min) || null,
    tmdb_id: Number(draft.tmdb_id) || null,
    poster_url: blank(draft.poster_url),
    synopsis: blank(draft.synopsis),
    prerequisites: draft.prerequisites.map((edge) => ({
      ...edge,
      note: blank(edge.note),
    })),
  }
}

function TmdbPicker({ draft, onApply }) {
  const [candidates, setCandidates] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [applied, setApplied] = useState(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    try {
      const results = await searchTmdb(draft.title, draft.media_type)
      setCandidates(results)
      if (results.length === 0) setMessage('No matches. Adjust the title and try again.')
    } catch (failure) {
      setMessage(failure.problems?.[0] ?? String(failure))
    } finally {
      setBusy(false)
    }
  }

  async function use(candidate) {
    setBusy(true)
    try {
      const details = await fetchTmdbDetails(candidate.kind, candidate.id, draft.media_type)
      onApply(details)
      setApplied(candidate)
      setCandidates([])
    } catch (failure) {
      setMessage(failure.problems?.[0] ?? String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="hairline border-y py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="meta normal-case tracking-normal">
          Search TMDb by the title above, then pick the right match. Every result is shown — the
          year and poster are there so a making-of special cannot pass for the film.
        </p>
        <Button onClick={run} disabled={busy || !draft.title.trim()}>
          {busy ? 'Searching…' : 'Search TMDb'}
        </Button>
      </div>

      {message && <p className="meta mt-2 normal-case tracking-normal text-warn">{message}</p>}

      {applied && (
        <p className="meta mt-2 text-ok">
          Using {applied.title} ({applied.year ?? '—'}) · tmdb {applied.id}
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((candidate) => (
            <li
              key={`${candidate.kind}-${candidate.id}`}
              className="hairline flex items-start gap-3 border bg-base p-2"
            >
              {candidate.poster_url ? (
                <img
                  src={candidate.poster_url}
                  alt=""
                  loading="lazy"
                  className="h-16 w-11 shrink-0 object-cover"
                />
              ) : (
                <div className="hairline h-16 w-11 shrink-0 border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {candidate.title}{' '}
                  <span className="meta">
                    {candidate.year ?? '—'} · {candidate.kind}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">{candidate.overview}</p>
              </div>
              <Button onClick={() => use(candidate)} disabled={busy} className="shrink-0">
                Use
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The form itself, mounted fresh per title.
 *
 * Seeding the draft is the mount, rather than an effect that watches which
 * title is open — `EditDialog` keys this on the id, so opening a different one
 * remounts it with new initial state and there is no reseed to accidentally
 * fire mid-edit and eat a keystroke.
 */
function TitleForm({ movie, movies, enums, problems, saving, onSave, onDelete, onClose }) {
  const isNew = !movie
  const [draft, setDraft] = useState(() =>
    movie ? { ...BLANK, ...movie, release_date: toDateInput(movie.release_date) } : BLANK,
  )
  const [insertBefore, setInsertBefore] = useState('')

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  /** TMDb owns metadata only, and a null from it never clears a curated value. */
  const applyDetails = (details) =>
    set(
      Object.fromEntries(
        Object.entries({
          tmdb_id: details.tmdb_id,
          poster_url: details.poster_url,
          synopsis: details.synopsis,
          runtime_min: details.runtime_min,
          release_date: details.release_date,
        }).filter(([, value]) => value !== null && value !== undefined),
      ),
    )

  const others = movies.filter((other) => other.id !== movie?.id)
  const chosen = new Set(draft.prerequisites.map((edge) => edge.id))

  function togglePrerequisite(id) {
    setDraft((current) => ({
      ...current,
      prerequisites: chosen.has(id)
        ? current.prerequisites.filter((edge) => edge.id !== id)
        : [...current.prerequisites, { id, strength: 'essential', note: null }],
    }))
  }

  function setEdge(id, patch) {
    setDraft((current) => ({
      ...current,
      prerequisites: current.prerequisites.map((edge) =>
        edge.id === id ? { ...edge, ...patch } : edge,
      ),
    }))
  }

  return (
    <div className="space-y-4">
      <Problems title="Not saved — nothing was written to mcu.json" lines={problems} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="id (kebab-case)" hint={isNew ? undefined : 'Fixed once created.'}>
          <TextInput
            value={draft.id}
            disabled={!isNew}
            onChange={(event) => set({ id: event.target.value })}
          />
        </Field>
        <Field label="Title">
          <TextInput
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
          />
        </Field>
        <Field label="Media type">
          <Select
            options={enums.media_types}
            value={draft.media_type}
            onChange={(event) => set({ media_type: event.target.value })}
          />
        </Field>
        <Field label="Tier">
          <Select
            options={enums.tiers}
            value={draft.tier}
            onChange={(event) => set({ tier: event.target.value })}
          />
        </Field>
        <Field label="Saga">
          <Select
            options={enums.sagas}
            value={draft.saga}
            onChange={(event) => set({ saga: event.target.value })}
          />
        </Field>
        <Field label="Universe">
          <Select
            options={enums.universes}
            value={draft.universe}
            onChange={(event) => set({ universe: event.target.value })}
          />
        </Field>
      </div>

      {isNew && (
        <Field
          label="Insert position"
          hint="Array order is the chronological timeline. You can also drag it into place afterwards."
        >
          <Select
            value={insertBefore}
            onChange={(event) => setInsertBefore(event.target.value)}
            options={[
              { value: '', label: '— At the beginning —' },
              ...movies.map((other, index) => ({
                value: other.id,
                label: `Before ${index + 1}. ${other.title}`,
              })),
            ]}
          />
        </Field>
      )}

      <TmdbPicker draft={draft} onApply={applyDetails} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Release date">
          <TextInput
            type="date"
            value={draft.release_date}
            onChange={(event) => set({ release_date: event.target.value })}
          />
        </Field>
        <Field label="Phase (blank = unphased)">
          <NumberInput
            min="1"
            max="10"
            value={draft.phase ?? ''}
            onChange={(event) => set({ phase: event.target.value ? Number(event.target.value) : null })}
          />
        </Field>
        <Field label="Runtime (min, blank = none)">
          <NumberInput
            min="1"
            value={draft.runtime_min ?? ''}
            onChange={(event) =>
              set({ runtime_min: event.target.value ? Number(event.target.value) : null })
            }
          />
        </Field>
      </div>

      {(draft.poster_url || draft.synopsis) && (
        <div className="hairline flex gap-3 border bg-base p-3">
          {draft.poster_url && (
            <img src={draft.poster_url} alt="" className="h-28 w-19 shrink-0 object-cover" />
          )}
          <div className="min-w-0 flex-1">
            {draft.tmdb_id ? <p className="meta">TMDb id {draft.tmdb_id}</p> : null}
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{draft.synopsis}</p>
          </div>
        </div>
      )}

      <section>
        <h3 className="meta mb-2 text-ink">Prerequisites</h3>
        <p className="meta mb-2 normal-case tracking-normal">
          Watch these first. Both directions of the graph are editable on the Dependencies tab.
        </p>
        <div className="hairline max-h-64 space-y-1 overflow-y-auto border bg-base p-2">
          {others.length === 0 && <p className="meta">Nothing else in the catalog yet.</p>}
          {others.map((other) => {
            const edge = draft.prerequisites.find((candidate) => candidate.id === other.id)
            return (
              <div key={other.id}>
                <label className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(edge)}
                    onChange={() => togglePrerequisite(other.id)}
                    className="accent-ink"
                  />
                  <span className="truncate text-xs text-ink-dim">
                    {other.title}{' '}
                    <span className="meta">{(other.release_date ?? '').slice(0, 4)}</span>
                  </span>
                </label>
                {edge && (
                  <div className="mb-1.5 ml-6 grid gap-1.5 sm:grid-cols-[10rem_1fr]">
                    <Segmented
                      name={`strength for ${other.title}`}
                      options={enums.strengths}
                      value={edge.strength}
                      onChange={(strength) => setEdge(other.id, { strength })}
                    />
                    <TextInput
                      value={edge.note ?? ''}
                      placeholder={`why ${other.title} first (optional)`}
                      onChange={(event) => setEdge(other.id, { note: event.target.value })}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <footer className="hairline flex items-center justify-between border-t pt-3">
        {movie ? (
          <Button tone="danger" onClick={() => onDelete(movie.id)} disabled={saving}>
            Delete title
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={saving || !draft.id.trim()}
            onClick={() => onSave(clean(draft), isNew ? insertBefore || null : undefined)}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </footer>
    </div>
  )
}

export function EditDialog({ open, movie, onClose, ...rest }) {
  return (
    <Dialog open={open} onClose={onClose} title={movie ? movie.title : 'New title'}>
      {/* Keyed by the title being edited, so opening a different one mounts a
          fresh form rather than reseeding a live one. */}
      {open && <TitleForm key={movie?.id ?? '__new__'} movie={movie} onClose={onClose} {...rest} />}
    </Dialog>
  )
}
