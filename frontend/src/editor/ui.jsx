import { useEffect, useRef } from 'react'

/**
 * The handful of controls the editor builds everything else out of.
 *
 * Deliberately not shared with `src/components`: those are the shipped app's,
 * shaped by its pages, and a tool that is mostly dense forms wants plainer,
 * tighter versions. The visual language is the same — hairlines, near-black,
 * mono metadata — because it reads from the same theme.
 */

const CONTROL =
  'w-full border border-hairline bg-base px-2 py-1.5 text-sm text-ink outline-none ' +
  'transition-colors placeholder:text-ink-faint focus:border-hairline-strong disabled:opacity-40'

export function Button({ tone = 'default', className = '', ...props }) {
  const tones = {
    default: 'border-hairline-strong text-ink-dim hover:text-ink',
    primary: 'border-ink-dim bg-ink text-base hover:bg-ink/90',
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
