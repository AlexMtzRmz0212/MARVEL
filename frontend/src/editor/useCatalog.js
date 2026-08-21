import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { fetchCatalog, fetchEnums, saveCatalog } from './api'

/**
 * The document, and the one way to change it.
 *
 * Every edit goes through `edit(mutate)`: it clones the current document, hands
 * the clone to the caller to change however it likes, and sends the result. The
 * server validates before it writes, so an invalid edit changes nothing —
 * neither on disk nor here, because local state is only replaced by what the
 * server actually wrote. There is no rollback path to get wrong.
 *
 * There is also no save button. A tool whose whole job is editing one file
 * should not also ask you to remember to commit; what it owes you instead is
 * never writing something broken, which is the trade this makes.
 */
export function useCatalog() {
  const queryClient = useQueryClient()
  const [error, setError] = useState(null)

  const state = useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog })
  const enums = useQuery({ queryKey: ['enums'], queryFn: fetchEnums, staleTime: Infinity })

  const mutation = useMutation({
    mutationFn: ({ document, revision }) => saveCatalog(document, revision),
    onSuccess: (next) => {
      queryClient.setQueryData(['catalog'], next)
      setError(null)
    },
    onError: (failure) => setError(failure.problems ?? [String(failure)]),
  })

  // `mutateAsync` rather than `mutation`, which is a fresh object every render
  // and would make `edit` a new function every render along with it — enough to
  // re-render the whole panel on each keystroke of an unrelated field.
  const { mutateAsync } = mutation

  const edit = useCallback(
    async (mutate) => {
      const current = queryClient.getQueryData(['catalog'])
      if (!current) return false
      const document = structuredClone(current.document)
      mutate(document)
      try {
        await mutateAsync({ document, revision: current.revision })
        return true
      } catch {
        // Held in `error` for the caller to render; a rejected edit is an
        // ordinary outcome here, not an exception to propagate.
        return false
      }
    },
    [queryClient, mutateAsync],
  )

  return {
    state: state.data ?? null,
    movies: state.data?.document.movies ?? [],
    enums: enums.data ?? null,
    loading: state.isLoading || enums.isLoading,
    loadError: state.error ?? enums.error,
    saving: mutation.isPending,
    error,
    setError,
    dismissError: () => setError(null),
    edit,
    reload: () => {
      setError(null)
      return queryClient.invalidateQueries({ queryKey: ['catalog'] })
    },
  }
}
