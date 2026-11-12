export const COMPARE_FILTER_KEYS = ['saga', 'universe', 'media_type', 'tier']

/** Filters that take several values at once; the rest take one. */
export const MULTI_KEYS = new Set(['universe'])

/** Read the filters out of the URL: a list for the multi-value ones. */
export function readFilters(searchParams) {
  return Object.fromEntries(
    COMPARE_FILTER_KEYS.map((key) => [
      key,
      MULTI_KEYS.has(key) ? searchParams.getAll(key) : (searchParams.get(key) ?? null),
    ]),
  )
}

/** How many filter groups are set, a multi-value group counting once. */
export function activeCount(filters) {
  return COMPARE_FILTER_KEYS.filter((key) =>
    MULTI_KEYS.has(key) ? filters[key].length > 0 : filters[key],
  ).length
}

/** Whether a title passes every filter that is set. Unset filters pass all. */
export function matchesFilters(movie, filters) {
  return COMPARE_FILTER_KEYS.every((key) => {
    const wanted = filters[key]
    if (MULTI_KEYS.has(key)) return wanted.length === 0 || wanted.includes(movie[key])
    return !wanted || movie[key] === wanted
  })
}
