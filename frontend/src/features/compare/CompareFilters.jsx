import { MEDIA_LABEL, SAGA_LABEL, TIER_LABEL } from '../../lib/format'

import { activeCount } from './filters'

function Choice({ id, label, value, values, format = (option) => option, onChange }) {
  // Keep a value the URL asked for even if the catalog does not offer it, so
  // the control never disagrees with the filter that is applied.
  const choices = value && !values.includes(value) ? [value, ...values] : values
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label text-ink-dim">
        {label}
      </label>
      <select
        id={id}
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
 * Universes are many and several can be wanted together, so a native select
 * will not do. A short scrolling checklist keeps the popover the size it was.
 */
function Checklist({ label, values, selected, onToggle }) {
  // Keep a universe the URL asked for even if the catalog does not offer it.
  const all = [...selected.filter((value) => !values.includes(value)), ...values]
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="label mb-1 text-ink-dim">
        {selected.length ? `${label} · ${selected.length}` : label}
      </legend>
      <div className="max-h-28 overflow-y-auto border-2 border-ink">
        {all.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm text-ink hover:bg-hairline"
          >
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="size-3.5 shrink-0 accent-[var(--color-ink)]"
            />
            <span className="truncate">{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Chips({ label, keys, labels, value, onPick }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span aria-hidden="true" className="label text-ink-dim">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onPick(value === key ? null : key)}
            className="chip"
          >
            {labels[key]}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Narrows both columns to the same subset. A popover beside the key rather than
 * a bar of its own, so the page keeps the room it had; the button carries a
 * count while anything is set, so a narrowed view is never a surprise. Filters
 * live in the URL, like the catalog's, so a filtered comparison is linkable.
 */
export function FilterMenu({
  open,
  onToggle,
  filters,
  options,
  setFilter,
  toggleUniverse,
  reset,
  resultCount,
  totalCount,
}) {
  const active = activeCount(filters)

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="chip">
        {active ? `Filter · ${active}` : 'Filter'}
      </button>

      {open && (
        <div className="floating absolute top-full right-0 z-20 mt-2 w-64">
          <div className="flex flex-col gap-3 px-3 py-2.5">
            <Choice
              id="compare-saga"
              label="Saga"
              value={filters.saga}
              values={options.sagas}
              format={(saga) => SAGA_LABEL[saga] ?? saga}
              onChange={(saga) => setFilter('saga', saga)}
            />
            <Checklist
              label="Universe"
              values={options.universes}
              selected={filters.universe}
              onToggle={toggleUniverse}
            />
            <Chips
              label="Format"
              keys={['film', 'series', 'special']}
              labels={MEDIA_LABEL}
              value={filters.media_type}
              onPick={(media) => setFilter('media_type', media)}
            />
            <Chips
              label="Tier"
              keys={['core', 'supporting', 'optional']}
              labels={TIER_LABEL}
              value={filters.tier}
              onPick={(tier) => setFilter('tier', tier)}
            />
          </div>

          <div className="flex items-center gap-2 border-t-2 border-ink px-3 py-2">
            <span className="meta text-ink-dim" aria-live="polite">
              {resultCount === totalCount
                ? `${totalCount} titles`
                : `${resultCount} of ${totalCount} titles`}
            </span>
            {active > 0 && (
              <button type="button" onClick={reset} className="btn btn-sm ml-auto">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
