/**
 * Shared shell for the two legal pages.
 *
 * Prose measure is capped well below the app's 1400px because these are the
 * only pages here that are read rather than scanned.
 */
export function LegalLayout({ title, updated, children }) {
  return (
    <article className="py-8">
      <header className="hairline border-b pb-6">
        <h1 className="text-3xl leading-tight font-medium tracking-tight text-ink">{title}</h1>
        <p className="meta mt-2">Last updated {updated}</p>
      </header>
      <div className="max-w-2xl">{children}</div>
    </article>
  )
}

export function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium tracking-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
        {children}
      </div>
    </section>
  )
}
