import { CHECKED, MAX_SCENES } from './creditData'
import { Button, Field, NumberInput, Segmented, TextInput } from './ui'

const UNCHECKED = 'Not checked'
const CHECKED_LABEL = 'Checked'

/**
 * What plays during and after the credits, for the title being edited.
 *
 * "Not checked" and "checked, none" are different claims and the form keeps them
 * apart: the first leaves the title silent about it on the site, the second says
 * there is nothing to wait for. A film or special takes one count; a series can
 * instead list the episodes that hold something back, and then its total is
 * their sum -- so the count field is only offered while that list is empty.
 */
export function CreditScenes({ value, isSeries, onChange }) {
  const checked = value !== null
  const set = (patch) => onChange({ ...value, ...patch })
  const episodes = value?.episodes ?? []

  function setEpisode(index, patch) {
    set({
      episodes: episodes.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    })
  }

  function addEpisode() {
    const last = episodes.reduce((high, entry) => Math.max(high, Number(entry.episode) || 0), 0)
    set({ episodes: [...episodes, { episode: last + 1, name: '', count: 1, note: '' }] })
  }

  return (
    <section>
      <h3 className="meta mb-2 text-ink">Credit scenes</h3>
      <div className="max-w-xs">
        <Segmented
          name="credit scenes"
          options={[UNCHECKED, CHECKED_LABEL]}
          value={checked ? CHECKED_LABEL : UNCHECKED}
          onChange={(option) => onChange(option === CHECKED_LABEL ? { ...CHECKED } : null)}
        />
      </div>
      <p className="meta mt-1.5 normal-case tracking-normal">
        {checked
          ? 'Somebody has sat through the credits. A count of 0 says there is nothing to wait for.'
          : 'Nobody has checked, so the site says nothing about this title.'}
      </p>

      {checked && (
        <div className="mt-3 space-y-3">
          {episodes.length === 0 && (
            <Field
              label={`Count (0–${MAX_SCENES})`}
              hint={isSeries ? 'Or list the episodes that hold something back, below.' : undefined}
            >
              <NumberInput
                min="0"
                max={MAX_SCENES}
                value={value.count ?? ''}
                onChange={(event) => set({ count: event.target.value })}
                className="sm:w-28"
              />
            </Field>
          )}

          {isSeries && (
            <div className="space-y-2">
              {episodes.map((entry, index) => (
                <div
                  key={index}
                  className="hairline grid items-end gap-2 border bg-paper p-2 sm:grid-cols-[5rem_1fr_5rem_1fr_auto]"
                >
                  <Field label="Episode">
                    <NumberInput
                      min="1"
                      value={entry.episode}
                      onChange={(event) => setEpisode(index, { episode: event.target.value })}
                    />
                  </Field>
                  <Field label="Name (optional)">
                    <TextInput
                      value={entry.name}
                      onChange={(event) => setEpisode(index, { name: event.target.value })}
                    />
                  </Field>
                  <Field label="Scenes">
                    <NumberInput
                      min="1"
                      max={MAX_SCENES}
                      value={entry.count}
                      onChange={(event) => setEpisode(index, { count: event.target.value })}
                    />
                  </Field>
                  <Field label="Note (optional)">
                    <TextInput
                      value={entry.note}
                      onChange={(event) => setEpisode(index, { note: event.target.value })}
                    />
                  </Field>
                  <Button
                    tone="danger"
                    aria-label={`Remove episode ${entry.episode || index + 1}`}
                    onClick={() => set({ episodes: episodes.filter((_, at) => at !== index) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button onClick={addEpisode}>Add an episode</Button>
            </div>
          )}

          <Field label="Note (optional)" hint="What happens, or what it sets up. Up to 280 characters.">
            <TextInput
              value={value.note}
              maxLength={280}
              onChange={(event) => set({ note: event.target.value })}
            />
          </Field>
        </div>
      )}
    </section>
  )
}
