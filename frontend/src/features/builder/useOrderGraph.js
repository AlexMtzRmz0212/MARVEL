import { useMemo } from 'react'

import { useEdges, useMovies } from '../../api/catalog'
import { createGraph, edgesFromApi } from '../../lib/validateOrder'

// Mirrors app/catalog.py: titles with no agreed in-universe placement sort
// after every title that has one, in release order.
const CHRONO_FALLBACK_OFFSET = 100_000

/**
 * The catalog and its edge set, indexed for local validation.
 *
 * Both requests are cached forever, so this costs one round trip for the whole
 * session and every subsequent drag validates with no network at all.
 */
export function useOrderGraph() {
  const moviesQuery = useMovies({ order: 'chronological' })
  const edgesQuery = useEdges()

  const movies = moviesQuery.data
  const edges = edgesQuery.data

  const graph = useMemo(() => {
    if (!movies || !edges) return null
    const nodes = Object.fromEntries(
      movies.map((movie) => [
        movie.id,
        movie.chrono_order ?? CHRONO_FALLBACK_OFFSET + movie.release_order,
      ]),
    )
    return createGraph(nodes, edgesFromApi(edges))
  }, [movies, edges])

  const titles = useMemo(
    () => (movies ? Object.fromEntries(movies.map((movie) => [movie.id, movie.title])) : {}),
    [movies],
  )

  const byId = useMemo(
    () => (movies ? new Map(movies.map((movie) => [movie.id, movie])) : new Map()),
    [movies],
  )

  return {
    graph,
    titles,
    byId,
    movies: movies ?? [],
    isPending: moviesQuery.isPending || edgesQuery.isPending,
    error: moviesQuery.error ?? edgesQuery.error,
  }
}
