import { useEffect, useRef, useState } from 'react'

/**
 * The handful of controls the editor builds everything else out of.
 *
 * Deliberately not shared with `src/components`: those are the shipped app's,
 * shaped by its pages, and a tool that is mostly dense forms wants plainer,
 * tighter versions. The visual language is the same — hairlines, near-black,
 * mono metadata — because it reads from the same theme.
 */

const CONTROL =
  'w-full border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none ' +
  'transition-colors placeholder:text-ink-faint focus:border-hairline-strong disabled:opacity-40'

export function Button({ tone = 'default', className = '', ...props }) {
  const tones = {
    default: 'border-hairline-strong text-ink-dim hover:text-ink',
    primary: 'border-ink-dim bg-ink text-paper hover:bg-ink/90',
    danger: 'border-danger/50 text-danger hover:bg-danger/10',
  }
  return (
    <button
      type="button"
      className={[
        'meta border px-2.5 py-1.5 transition-colors disabled:opacity-40',
        tones[tone],
        className,
      ].join(' ')}
      {...props}
    />
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="meta mb-1 block">{label}</span>
      {children}
      {hint && <span className="meta mt-1 block normal-case tracking-normal">{hint}</span>}
    </label>
  )
}

export function TextInput({ className = '', ...props }) {
  return <input type="text" className={[CONTROL, className].join(' ')} {...props} />
}

export function NumberInput({ className = '', ...props }) {
  return (
    <input type="number" className={[CONTROL, 'tabular-nums', className].join(' ')} {...props} />
  )
}

export function Select({ options, className = '', ...props }) {
  return (
    <select className={[CONTROL, className].join(' ')} {...props}>
      {options.map((option) => {
        const [value, label] =
          typeof option === 'string' ? [option, option] : [option.value, option.label]
        return (
          <option key={value} value={value}>
            {label}
          </option>
        )
      })}
    </select>
  )
}

/**
 * A type-to-filter select. Typing narrows `options` to a listbox below the
 * field; Enter picks the highlighted match, Escape or a click outside backs
 * out without changing the value. Built by hand rather than with `<datalist>`
 * because that element won't let us style the listbox to match the rest of
 * the editor, and its Enter-to-commit behavior is inconsistent across browsers.
 */
export function Combobox({ value, onChange, options, placeholder, className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef(null)

  const selected = options.find((option) => option.value === value)
  const shown = open ? query : (selected?.label ?? '')
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const activeIndex = Math.min(highlight, matches.length - 1)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const pick = (option) => {
    onChange(option.value)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={['relative', className].join(' ')}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={CONTROL}
        placeholder={placeholder}
        value={shown}
        onFocus={() => {
          setQuery('')
          setOpen(true)
          setHighlight(0)
        }}
        // Picking an option leaves the input focused (see the option button's
        // onMouseDown below), so a second click needs its own handler —
        // `onFocus` won't fire again for an element that's already focused.
        onClick={() => {
          if (open) return
          setQuery('')
          setOpen(true)
          setHighlight(0)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setHighlight((current) => Math.min(current + 1, matches.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((current) => Math.max(current - 1, 0))
          } else if (event.key === 'Enter' && open && matches[activeIndex]) {
            event.preventDefault()
            pick(matches[activeIndex])
          } else if (event.key === 'Escape') {
            setOpen(false)
            setQuery('')
          }
        }}
      />
      {open && (
        <ul
          role="listbox"
          className="hairline absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border bg-surface"
        >
          {matches.length === 0 && (
            <li className="meta px-2 py-1.5 normal-case tracking-normal">No matches</li>
          )}
          {matches.map((option, index) => (
            <li key={option.value} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                // Prevents the input from blurring before the click lands, so
                // `onBlur` doesn't close the list out from under the click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                className={[
                  'block w-full px-2 py-1.5 text-left text-sm',
                  index === activeIndex
                    ? 'bg-raised text-ink'
                    : 'text-ink-dim hover:bg-raised hover:text-ink',
                ].join(' ')}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A two-way choice rendered as a pair of buttons rather than a dropdown —
 *  essential/recommended is read far more often than it is changed, and a
 *  select hides the current value behind its own chrome. */
export function Segmented({ options, value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={[
            'meta flex-1 border px-2 py-1 transition-colors',
            value === option
              ? 'border-hairline-strong bg-raised text-ink'
              : 'border-hairline text-ink-faint hover:text-ink-dim',
          ].join(' ')}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/**
 * A modal built on `<dialog>`, so the browser supplies the focus trap, the
 * inert background and Escape — three things a hand-rolled overlay gets wrong
 * in ways nobody notices until someone tries to use it by keyboard.
 */
export function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Escape and the backdrop both close it; `onClose` fires either way.
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close()
      }}
      className="hairline m-auto w-[min(56rem,92vw)] border bg-surface p-0 text-ink backdrop:bg-black/70"
    >
      {open && (
        <>
          <header className="hairline flex items-center justify-between border-b px-5 py-3">
            <h2 className="meta text-ink">{title}</h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="meta px-2 text-ink-faint transition-colors hover:text-ink"
            >
              ✕
            </button>
          </header>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </>
      )}
    </dialog>
  )
}

/** A list of reasons something was refused. */
export function Problems({ title, lines, tone = 'danger', onDismiss }) {
  if (!lines?.length) return null
  const border = tone === 'danger' ? 'border-danger/50 bg-danger/5' : 'border-warn/40 bg-warn/5'
  return (
    <div className={`border px-3 py-2 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="meta text-ink">{title}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="meta text-ink-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>
      <ul className="mt-1.5 space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-xs leading-relaxed text-ink-dim">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
