import { useQuery } from '@tanstack/react-query'

import { fetchHistory } from './api'
import { Button, Dialog } from './ui'

/**
 * Earlier versions of the catalog, newest first.
 *
 * Every save keeps the version it replaced, which is what stands in for git now
 * that the live catalog is not a file in the repo. Restoring one is an ordinary
 * save — validated again, and itself undoable — so there is nothing here that
 * can put the site into a state an edit could not.
 */
export function History({ open, onClose, saving, onRestore }) {
  const history = useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
    enabled: open,
    // Always fresh when opened: a stale list would offer a version that has
    // since been pushed out of the last-30 window.
    staleTime: 0,
  })

  return (
    <Dialog open={open} onClose={onClose} title="Earlier versions">
      {history.isPending && <p className="meta">Loading…</p>}
      {history.error && <p className="meta text-danger">{history.error.message}</p>}
      {history.data?.length === 0 && (
        <p className="meta">Nothing yet. A version appears here each time you save.</p>
      )}
      {history.data?.length > 0 && (
        <ul className="divide-y divide-hairline">
          {history.data.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 py-2">
              <span className="meta">{new Date(entry.saved_at).toLocaleString()}</span>
              <span className="meta text-ink-faint">{entry.titles} titles</span>
              <Button
                className="ml-auto"
                disabled={saving}
                onClick={async () => {
                  if (await onRestore(entry.id)) onClose()
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
