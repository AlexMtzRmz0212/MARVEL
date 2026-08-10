import { MEDIA_LABEL, SAGA_LABEL, TIER_LABEL } from '../../lib/format'

const PHASES = [1, 2, 3, 4, 5, 6]

function Toggle({ active, onClick, children, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'meta border px-2.5 py-1 transition-colors',
        active
          ? 'border-transparent text-base'
          : 'border-hairline text-ink-faint hover:border-hairline-strong hover:text-ink-dim',
      ].join(' ')}
      style={active ? { backgroundColor: accent ?? 'var(--color-ink)' } : undefined}
    >
      {children}
    </button>
  )
}

function Group({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="meta mr-1 text-ink-faint/60">{label}</span>
      {children}
    </div>
  )
}

/**
 * Every filter lives in the URL rather than component state, so a filtered view
 * is linkable and the browser's back button does what you expect.
 */
export function FilterBar({ filters, setFilter, reset, resultCount, totalCount }) {
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="hairline flex flex-col gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Group label="Phase">
          {PHASES.map((phase) => (
            <Toggle
              key={phase}
              active={filters.phase === String(phase)}
              onClick={() => setFilter('phase', filters.phase === String(phase) ? null : phase)}
            >
              {phase}
            </Toggle>
          ))}
        </Group>

        <Group label="Saga">
          {['Infinity Saga', 'Multiverse Saga'].map((saga) => (
            <Toggle
              key={saga}
              active={filters.saga === saga}
              accent={
                saga === 'Infinity Saga' ? 'var(--color-infinity)' : 'var(--color-multiverse)'
              }
              onClick={() => setFilter('saga', filters.saga === saga ? null : saga)}
            >
              {SAGA_LABEL[saga].replace(' Saga', '')}
            </Toggle>
          ))}
        </Group>

        <Group label="Format">
          {['film', 'series', 'special'].map((media) => (
            <Toggle
              key={media}
              active={filters.media_type === media}
              onClick={() =>
                setFilter('media_type', filters.media_type === media ? null : media)
              }
            >
              {MEDIA_LABEL[media]}
            </Toggle>
          ))}
        </Group>

        <Group label="Tier">
          {['core', 'supporting', 'optional'].map((tier) => (
            <Toggle
              key={tier}
              active={filters.tier === tier}
              onClick={() => setFilter('tier', filters.tier === tier ? null : tier)}
            >
              {TIER_LABEL[tier]}
            </Toggle>
          ))}
        </Group>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 sm:max-w-xs">
          <span className="sr-only">Search titles</span>
          <input
            type="search"
            value={filters.q ?? ''}
            onChange={(event) => setFilter('q', event.target.value || null)}
            placeholder="Search titles"
            className="hairline w-full border bg-surface px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
          />
        </label>

        <span className="meta">
          {resultCount === totalCount
            ? `${totalCount} titles`
            : `${resultCount} of ${totalCount}`}
        </span>

        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="meta text-ink-faint underline underline-offset-4 transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
