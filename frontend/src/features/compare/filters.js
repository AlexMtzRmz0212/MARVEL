export const COMPARE_FILTER_KEYS = ['saga', 'universe', 'media_type', 'tier']

/** Whether a title passes every filter that is set. Unset filters pass all. */
export function matchesFilters(movie, filters) {
  return COMPARE_FILTER_KEYS.every((key) => !filters[key] || movie[key] === filters[key])
}
