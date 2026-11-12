import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router'

/** Provided by `TitlePeekProvider` in the app shell. */
export const TitlePeekContext = createContext(null)

/**
 * `{ openTitle(id), openMenu(id, x, y) }`.
 *
 * Outside the provider there is no peek to open, so a title opens as its own
 * page and there is no status menu (`openMenu` is absent) -- the app behaves as
 * it did before the peek existed.
 */
export function useTitlePeek() {
  const peek = useContext(TitlePeekContext)
  const navigate = useNavigate()
  return peek ?? { openTitle: (id) => navigate(`/movies/${id}`) }
}
