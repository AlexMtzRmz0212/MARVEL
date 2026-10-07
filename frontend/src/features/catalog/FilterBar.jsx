import { MEDIA_LABEL, SAGA_LABEL, TIER_LABEL } from '../../lib/format'

function Toggle({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="chip">
      {children}
    </button>
  )
}

function Group({ label, children }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="label mr-1 text-ink-dim">
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * A native select for the long lists: sixteen sagas and twenty universes are
 * far too many to lay out as toggles, and the platform picker is the one that
 * already works with every keyboard, screen reader and phone.
 */
function Choice({ id, label, value, values, format = (option) => option, onChange }) {
  // Keep a value the URL asked for even if the catalog does not offer it, so
  // the control never silently disagrees with the filter that is applied.
  const choices = value && !values.includes(value) ? [value, ...values] : values
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="label text-ink-dim">
        {label}
      </label>
      <select
        id={id}
        name={id.replace('catalog-', '')}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="field"
      >
        <option value="">Any</option>
        {choices.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Every filter lives in the URL rather than component state, so a filtered view
 * is linkable and the browser's back button does what you expect.
 */
export function FilterBar({
  filters,
  options,
  setFilter,
  reset,
  resultCount,
  totalCount,
  watchedDisplayMode,
  setWatchedDisplayMode,
}) {
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="catalog-search" className="label text-ink-dim">
            Search
          </label>
          <input
            id="catalog-search"
            type="search"
            name="q"
            value={filters.q ?? ''}
            onChange={(event) => setFilter('q', event.target.value || null)}
            placeholder="Iron Man, Loki, Wakanda…"
            autoComplete="off"
            spellCheck={false}
            className="field"
          />
        </div>

        <Choice
          id="catalog-saga"
          label="Saga"
          value={filters.saga}
          values={options.sagas}
          format={(saga) => SAGA_LABEL[saga] ?? saga}
          onChange={(saga) => setFilter('saga', saga)}
        />

        <Choice
          id="catalog-universe"
          label="Universe"
          value={filters.universe}
          values={options.universes}
          onChange={(universe) => setFilter('universe', universe)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Group label="Phase">
          {options.phases.map((phase) => (
            <Toggle
              key={phase}
              active={filters.phase === String(phase)}
              onClick={() => setFilter('phase', filters.phase === String(phase) ? null : phase)}
            >
              {phase}
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

        <Group label="Sorted as">
          {[
            ['unseen', 'Not seen'],
            ['unsure', "Don't recall"],
            ['unsorted', 'Unsorted'],
          ].map(([status, label]) => (
            <Toggle
              key={status}
              active={filters.status === status}
              onClick={() => setFilter('status', filters.status === status ? null : status)}
            >
              {label}
            </Toggle>
          ))}
        </Group>

        <Group label="Watched">
          <Toggle
            active={watchedDisplayMode === 'fade'}
            onClick={() => setWatchedDisplayMode('fade')}
          >
            Fade
          </Toggle>
          <Toggle
            active={watchedDisplayMode === 'hide'}
            onClick={() => setWatchedDisplayMode('hide')}
          >
            Hide
          </Toggle>
        </Group>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
        <span className="meta text-sm text-ink-dim" aria-live="polite">
          {resultCount === totalCount
            ? `${totalCount} titles`
            : `${resultCount} of ${totalCount} titles`}
        </span>

        {hasFilters && (
          <button type="button" onClick={reset} className="btn btn-sm ml-auto">
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
