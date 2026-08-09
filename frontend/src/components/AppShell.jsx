import { NavLink, Outlet } from 'react-router'

const NAV = [
  { to: '/catalog', label: 'Catalog' },
  { to: '/orders', label: 'My orders' },
  { to: '/progress', label: 'Progress' },
]

function navClass({ isActive }) {
  return [
    'meta px-3 py-1.5 transition-colors',
    isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
  ].join(' ')
}

export function AppShell() {
  return (
    <div className="min-h-dvh bg-base">
      <header className="hairline sticky top-0 z-30 border-b bg-base/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6">
          <NavLink to="/catalog" className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-ink">
              MARVEL
            </span>
            <span className="meta hidden sm:inline">Watch Order</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
