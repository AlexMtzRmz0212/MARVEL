import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdminPage } from './AdminPage'

/**
 * The page is open to everyone and the server is what asks for the password, so
 * what matters here is that each answer the server can give puts up the right
 * thing: a password form when signed out, nothing but a notice when the editor
 * is switched off, and the editor itself only once there is a session.
 */

vi.mock('./EditorApp', () => ({
  EditorApp: ({ onSignOut }) => (
    <div>
      <p>the editor</p>
      {onSignOut && <button onClick={onSignOut}>Lock editor</button>}
    </div>
  ),
}))

function respond(status, body) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminPage', () => {
  it('asks for the password when there is no session, and never mounts the editor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, { authenticated: false, open: false })))
    renderPage()

    expect(await screen.findByLabelText('Editor password')).toBeInTheDocument()
    expect(screen.queryByText('the editor')).not.toBeInTheDocument()
  })

  it('says the editor is off when the server has no password configured', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(404, { detail: 'Not Found' })))
    renderPage()

    expect(await screen.findByText(/not enabled on this server/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Editor password')).not.toBeInTheDocument()
  })

  it('shows the editor once the session is valid', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, { authenticated: true, open: false })))
    renderPage()

    expect(await screen.findByText('the editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock editor' })).toBeInTheDocument()
  })

  it('offers no way to lock an editor that has no password', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, { authenticated: true, open: true })))
    renderPage()

    expect(await screen.findByText('the editor')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lock editor' })).not.toBeInTheDocument()
  })

  it('reports a wrong password and clears the field', async () => {
    const fetchMock = vi.fn((url) =>
      url.endsWith('/login')
        ? respond(401, { detail: 'Incorrect password.' })
        : respond(200, { authenticated: false, open: false }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const field = await screen.findByLabelText('Editor password')
    fireEvent.change(field, { target: { value: 'guess' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.')
    await waitFor(() => expect(field).toHaveValue(''))
    expect(screen.queryByText('the editor')).not.toBeInTheDocument()
  })

  it('opens the editor after the right password', async () => {
    const fetchMock = vi.fn((url) =>
      url.endsWith('/login')
        ? respond(200, { authenticated: true, open: false })
        : respond(200, { authenticated: false, open: false }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.change(await screen.findByLabelText('Editor password'), {
      target: { value: 'right one' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText('the editor')).toBeInTheDocument()
    const login = fetchMock.mock.calls.find(([url]) => url.endsWith('/login'))
    expect(JSON.parse(login[1].body)).toEqual({ password: 'right one' })
  })
})
