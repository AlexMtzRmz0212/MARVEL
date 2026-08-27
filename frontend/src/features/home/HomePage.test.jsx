import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { HomePage } from './HomePage'

/**
 * The landing page is the one page in the app with no state to get wrong, so
 * what is worth testing is that it says the true things: the figures are the
 * catalog's own, the hero graph draws every title of its excerpt somewhere
 * finite, and the headings are a hierarchy rather than four sizes of text.
 */

vi.mock('../../api/catalog', () => ({
  useMovies: () => ({
    data: [
      { id: 'a', title: 'A', phase: 1, runtime_min: 120 },
      { id: 'b', title: 'B', phase: 1, runtime_min: 90 },
      { id: 'c', title: 'C', phase: 2, runtime_min: 150 },
    ],
  }),
  useEdges: () => ({
    data: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'a', to: 'c' },
      { from: 'a', to: 'b' },
    ],
  }),
}))

/** jsdom has no `matchMedia`. Wide layout, and no motion, so no frames run. */
function media({ wide }) {
  window.matchMedia = (query) => ({
    matches: query.includes('min-width') ? wide : true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

function show({ wide = true } = {}) {
  media({ wide })
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

beforeAll(() => media({ wide: true }))

describe('HomePage', () => {
  it('leads with one heading and the two ways in', () => {
    show()

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('What to watch, and what to watch first.')

    expect(screen.getByRole('link', { name: 'Open the catalog' })).toHaveAttribute(
      'href',
      '/catalog',
    )
    expect(screen.getByRole('link', { name: 'See the map' })).toHaveAttribute('href', '/timeline')
  })

  it('counts the catalog rather than quoting a number written down once', () => {
    show()

    // Three titles, four edges, two phases, and 360 minutes of them.
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('describes the hero graph, and places every title in it', () => {
    const { container } = show()

    const graph = container.querySelector('svg[role="img"]')
    expect(graph.getAttribute('aria-label')).toMatch(/watched first/)

    const placed = [...graph.querySelectorAll('g[transform]')]
    expect(placed).toHaveLength(19)
    for (const node of placed) {
      const [x, y] = node.getAttribute('transform').match(/-?[\d.]+/g).map(Number)
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
  })

  it('drops to the shorter excerpt when there is no room for the wide one', () => {
    const { container } = show({ wide: false })

    const graph = container.querySelector('svg[role="img"]')
    expect(graph.querySelectorAll('g[transform]')).toHaveLength(9)
  })

  it('never prints two labels on top of each other', () => {
    // The phone frame is about a quarter the width of the wide one, so the
    // ornaments are drawn at half size to come out at the same number of
    // pixels. While they were not, "WandaVision" and "Loki" overlapped.
    for (const wide of [true, false]) {
      const { container, unmount } = show({ wide })

      const labels = [...container.querySelectorAll('svg[role="img"] g[transform]')]
        .map((group) => ({ group, text: group.querySelector('text') }))
        .filter(({ text }) => text)
        .map(({ group, text }) => {
          const [x, y] = group.getAttribute('transform').match(/-?[\d.]+/g).map(Number)
          const size = Number(text.getAttribute('font-size'))
          // jsdom measures no glyphs. 0.6em a character is the usual estimate
          // for a monospace face, and the labels are set in one.
          const half = (text.textContent.length * size * 0.6) / 2
          const top = y + Number(text.getAttribute('y')) - size
          return { mark: text.textContent, x0: x - half, x1: x + half, y0: top, y1: top + size }
        })

      expect(labels.length).toBeGreaterThan(1)
      const overlapping = labels.flatMap((a, index) =>
        labels
          .slice(index + 1)
          .filter((b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1)
          .map((b) => `${a.mark} over ${b.mark}`),
      )
      expect(overlapping).toEqual([])

      unmount()
    }
  })

  it('sends each panel somewhere real', () => {
    show()

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/catalog', '/timeline', '/orders', '/progress']))
  })
})
