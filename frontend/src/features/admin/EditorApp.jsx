import { useState } from 'react'

import { EXPORT_URL, fetchUsage } from './api'
import { Dependencies } from './Dependencies'
import { EditDialog } from './EditDialog'
import { Gallery } from './Gallery'
import { History } from './History'
import { Reorder } from './Reorder'
import { useCatalog } from './useCatalog'
import { Button, Problems } from './ui'

/**
 * The visual editor for the catalog, shown at `/admin` once the password is in.
 *
 * Three views of one document: the gallery for metadata, the dependency panel
 * for the graph, the reorder list for chronology. All three write through the
 * same validate-then-save path, so nothing invalid can reach the database and a
 * bad edit cannot become a 500 on the public site. A valid edit is live at once.
 *
 * Replaces the Streamlit build this repo used to carry. That tool re-ran its
 * whole script on every interaction, which is why it needed a session_state
 * mirror of every widget and a guard against its own dialog re-seeding itself;
 * none of that machinery has an equivalent here.
 */

const TABS = [
  { id: 'gallery', label: 'Gallery' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'timeline', label: 'Timeline order' },
]

function StatusBar({ state, saving, onReload, onHistory, onSignOut }) {
  const broken = state.problems.length > 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={[
          'meta border px-2 py-1',
          broken ? 'border-danger/50 text-danger' : 'border-ok/40 text-ok',
        ].join(' ')}
      >
        {broken ? `${state.problems.length} problem(s)` : 'Valid'}
      </span>
      <span className="meta">
        {state.counts.titles} titles · {state.counts.edges} edges
        {state.warnings.length > 0 ? ` · ${state.warnings.length} warning(s)` : ''}
      </span>
      <span className="meta ml-auto">{saving ? 'Saving…' : 'Saves live when valid'}</span>
      <Button onClick={onReload} disabled={saving}>
        Reload
      </Button>
      <Button onClick={onHistory} disabled={saving}>
        Earlier versions
      </Button>
      {/* A download, not a request: the server answers with the file. */}
      <a
        href={EXPORT_URL}
        download="mcu.json"
        className="meta border border-hairline-strong px-2.5 py-1.5 text-ink-dim transition-colors hover:text-ink"
      >
        Export mcu.json
      </a>
      {onSignOut && <Button onClick={onSignOut}>Lock editor</Button>}
    </div>
  )
}

export function EditorApp({ onSignOut }) {
  const catalog = useCatalog()
  const [tab, setTab] = useState('gallery')
  const [query, setQuery] = useState('')
  const [universe, setUniverse] = useState('')
  const [focusId, setFocusId] = useState(null)
  // null = closed, '' = the new-title dialog, otherwise the id being edited.
  const [editing, setEditing] = useState(null)
  const [showWarnings, setShowWarnings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  if (catalog.loading) {
    return <p className="meta p-8">Reading the catalog…</p>
  }
  if (catalog.loadError || !catalog.state || !catalog.enums) {
    // A 422 here is the stored document being unreadable, which is a different
    // problem from the server being down and wants a different instruction.
    const unparseable = catalog.loadError?.status === 422
    return (
      <div className="space-y-3 p-8">
        <Problems
          title={unparseable ? 'The catalog could not be read' : 'Could not reach the server'}
          lines={
            unparseable
              ? catalog.loadError.problems
              : [
                  catalog.loadError?.message ?? 'No response from /api/admin.',
                  'Locally, start the API with run.bat or catalog.bat.',
                ]
          }
        />
        <Button onClick={catalog.reload}>Try again</Button>
      </div>
    )
  }

  const { state, movies, enums, saving, error, edit } = catalog
  const current = editing ? movies.find((movie) => movie.id === editing) : null

  async function saveTitle(entry, insertBefore) {
    const existing = movies.findIndex((movie) => movie.id === entry.id)
    // `insertBefore === undefined` means an edit rather than an insert. Without
    // this a new title reusing an existing id would silently overwrite that
    // title instead of being refused — validation cannot catch it, because the
    // result is a perfectly valid catalog with one entry quietly replaced.
    if (insertBefore !== undefined && existing >= 0) {
      catalog.setError([`id '${entry.id}' already exists — ids have to be unique.`])
      return
    }

    const ok = await edit((document) => {
      if (existing >= 0) {
        document.movies[existing] = entry
        return
      }
      const at = insertBefore ? document.movies.findIndex((m) => m.id === insertBefore) : 0
      document.movies.splice(at < 0 ? document.movies.length : at, 0, entry)
    })
    if (ok) setEditing(null)
  }

  async function deleteTitle(id) {
    // Saved orders and watch progress hold foreign keys into the title with
    // ON DELETE CASCADE, so deleting it deletes those rows for every user. Say
    // how many before it happens; a failed lookup does not block the delete.
    let usage = null
    try {
      usage = await fetchUsage(id)
    } catch {
      // Falls through to the plain confirmation below.
    }
    const used = usage ? usage.watch_progress + usage.order_items : 0
    const message = used
      ? `Deleting '${id}' also deletes ${usage.watch_progress} watch-progress and ${usage.order_items} saved-order entries belonging to users. This is live at once. Delete anyway?`
      : `Delete '${id}'? This is live at once.`
    if (!window.confirm(message)) return

    const ok = await edit((document) => {
      document.movies = document.movies
        .filter((movie) => movie.id !== id)
        // An edge pointing at a title that no longer exists is a dangling
        // reference, which validation rejects — so the delete has to take them.
        .map((movie) => ({
          ...movie,
          prerequisites: (movie.prerequisites ?? []).filter((edge) => edge.id !== id),
        }))
    })
    if (ok) setEditing(null)
  }

  return (
    <div className="mx-auto max-w-[110rem] p-4 sm:p-6">
      <header className="hairline mb-4 space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg text-ink">Catalog editor</h1>
          <code className="meta">{state.storage}</code>
        </div>
        <StatusBar
          state={state}
          saving={saving}
          onReload={catalog.reload}
          onHistory={() => setShowHistory(true)}
          onSignOut={onSignOut}
        />
        <Problems
          title="Not saved — nothing was changed"
          lines={error}
          onDismiss={catalog.dismissError}
        />
        <Problems title="The stored catalog is currently invalid" lines={state.problems} />
        {state.warnings.length > 0 && (
          <div>
            <Button onClick={() => setShowWarnings((value) => !value)}>
              {showWarnings ? 'Hide' : 'Show'} {state.warnings.length} warning(s)
            </Button>
            {showWarnings && (
              <div className="mt-2">
                <Problems title="Warnings" lines={state.warnings} tone="warn" />
              </div>
            )}
          </div>
        )}
      </header>

      <nav className="mb-4 flex gap-1.5">
        {TABS.map((entry) => (
          <Button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={tab === entry.id ? 'bg-raised text-ink' : ''}
          >
            {entry.label}
          </Button>
        ))}
      </nav>

      {tab === 'gallery' && (
        <Gallery
          movies={movies}
          enums={enums}
          query={query}
          universe={universe}
          onQuery={setQuery}
          onUniverse={setUniverse}
          onEdit={setEditing}
          onAdd={() => setEditing('')}
        />
      )}

      {tab === 'dependencies' && (
        <Dependencies
          movies={movies}
          enums={enums}
          warnings={state.warnings}
          problems={error}
          saving={saving}
          focusId={focusId}
          onFocus={setFocusId}
          onEdit={edit}
        />
      )}

      {tab === 'timeline' && <Reorder movies={movies} onEdit={edit} />}

      <History
        open={showHistory}
        onClose={() => setShowHistory(false)}
        saving={saving}
        onRestore={catalog.restore}
      />

      <EditDialog
        open={editing !== null}
        movie={current}
        movies={movies}
        enums={enums}
        problems={error}
        saving={saving}
        onSave={saveTitle}
        onDelete={deleteTitle}
        onClose={() => {
          setEditing(null)
          catalog.dismissError()
        }}
      />
    </div>
  )
}
