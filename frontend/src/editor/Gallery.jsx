import { accentFor } from '../lib/format'
import { Button, Select, TextInput } from './ui'

/**
 * The catalog is a wall of posters, so the editor looks like one.
 *
 * A grid rather than a table because the fastest way to find the title you mean
 * among 123 of them is to recognise its artwork, and because a missing poster
 * is then a hole you can see rather than an empty cell nobody scans for.
 */

function Card({ movie, onEdit }) {
  const badges = [
    movie.phase ? `P${movie.phase}` : null,
    movie.tier,
    movie.universe !== 'Earth-616' ? movie.universe : null,
  ].filter(Boolean)

  return (
    <button
      type="button"
      onClick={() => onEdit(movie.id)}
      className="hairline group block border bg-surface text-left transition-colors hover:border-hairline-strong"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-base">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-85"
          />
        ) : (
          <div className="meta flex size-full items-center justify-center p-2 text-center">
            no poster
          </div>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ backgroundColor: accentFor(movie) }}
        />
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs text-ink">{movie.title}</p>
        <p className="meta mt-0.5 truncate">
          {(movie.release_date ?? '').slice(0, 4) || '—'}
          {badges.length > 0 ? ` · ${badges.join(' · ')}` : ''}
        </p>
      </div>
    </button>
  )
}

export function Gallery({ movies, enums, query, universe, onQuery, onUniverse, onEdit, onAdd }) {
  const needle = query.trim().toLowerCase()
  const shown = movies.filter((movie) => {
    if (needle && !movie.title.toLowerCase().includes(needle) && !movie.id.includes(needle)) {
      return false
    }
    return !universe || movie.universe === universe
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search titles…"
          className="max-w-xs"
        />
        <Select
          value={universe}
          onChange={(event) => onUniverse(event.target.value)}
          className="max-w-56"
          options={[{ value: '', label: 'All universes' }, ...enums.universes]}
        />
        <span className="meta">
          {shown.length} of {movies.length}
        </span>
        <Button tone="primary" onClick={onAdd} className="ml-auto">
          Add title
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {shown.map((movie) => (
          <Card key={movie.id} movie={movie} onEdit={onEdit} />
        ))}
      </div>

      {shown.length === 0 && <p className="meta py-8 text-center">Nothing matches.</p>}
    </div>
  )
}
