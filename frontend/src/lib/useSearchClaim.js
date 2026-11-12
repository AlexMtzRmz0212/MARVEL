import { useEffect, useRef } from 'react'

import { claimSearch } from './searchTarget'

const KEYS = ['find', 'refocus', 'onPick', 'renderPicked', 'origin', 'onQuery', 'initialQuery']

/**
 * Claim the search bubble for as long as the calling page is mounted.
 *
 * The claim is made once, from whichever handlers the page has on its first
 * render, and each handler reads the latest closure through a ref -- so the
 * page can close over its own state without re-claiming, which would notify
 * every subscriber on every render. A handler the page does not pass is left
 * off the claim entirely, because the bubble tells "this page answers a pick
 * itself" from "this page has no opinion" by whether the key is there.
 */
export function useSearchClaim(handlers) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const claim = {}
    for (const key of KEYS) {
      if (ref.current[key]) claim[key] = (...args) => ref.current[key]?.(...args)
    }
    return claimSearch(claim)
  }, [])
}
