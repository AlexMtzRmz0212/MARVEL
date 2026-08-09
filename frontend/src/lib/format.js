/** Presentation helpers. Pure, so they are trivially testable. */

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(isoDate) {
  if (!isoDate) return ''
  // Parse as a plain date. `new Date('2008-05-02')` is UTC midnight, which can
  // render as the previous day in negative-offset time zones.
  const [year, month, day] = isoDate.split('-').map(Number)
  return DATE_FORMAT.format(new Date(year, month - 1, day))
}

export function year(isoDate) {
  return isoDate ? isoDate.slice(0, 4) : ''
}

export function formatRuntime(minutes) {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h ${rest}m` : `${rest}m`
}

/** Long spans read better rounded to the hour: "44h" beats "2688m". */
export function formatTotalRuntime(minutes) {
  if (!minutes) return null
  if (minutes < 90) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

export const SAGA_LABEL = {
  infinity: 'Infinity Saga',
  multiverse: 'Multiverse Saga',
  none: 'Unaffiliated',
}

export const MEDIA_LABEL = {
  film: 'Film',
  series: 'Series',
  special: 'Special',
}

export const TIER_LABEL = {
  core: 'Core',
  supporting: 'Supporting',
  optional: 'Optional',
  adjacent: 'Adjacent',
}

/**
 * Marvel Comics Earth designations are already display-ready strings (e.g.
 * "Earth-616", "Multiverse / TVA"), so there is no separate label table to
 * keep in sync -- `movie.universe` is rendered as-is.
 */

/** Saga drives the accent colour everywhere: cards, graph nodes, progress. */
export function accentFor(movie) {
  if (movie.tier === 'adjacent') return 'var(--color-adjacent)'
  if (movie.saga === 'multiverse') return 'var(--color-multiverse)'
  if (movie.saga === 'infinity') return 'var(--color-infinity)'
  return 'var(--color-adjacent)'
}

export function phaseLabel(phase) {
  return phase ? `Phase ${phase}` : 'Unphased'
}
