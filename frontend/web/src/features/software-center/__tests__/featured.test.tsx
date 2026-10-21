import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareFeatured } from '../featured'
import type { SoftwareEntry } from '../types'
import { SoftwareTestRouter } from './router-fixture'

const entries: SoftwareEntry[] = ['Browser', 'Mail', 'Editor'].map((name) => ({
  id: name,
  name,
  description: 'An everyday companion',
  kind: 'software',
  platform: 'Windows',
  version: '1.0',
  downloadUrl: `/downloads/${name}.exe`,
  filename: `${name}.exe`,
  detailUrl: '',
  imageUrl: '',
  appearance: 'generic',
  sortOrder: 0,
  published: true,
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  }))
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  // Supply browser layout absent in jsdom; keep the real carousel engine.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.slot !== 'carousel-item') return 0
      return [...(this.parentElement?.children ?? [])].indexOf(this) * 600
    }
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function advanceSlide() {
  act(() => vi.advanceTimersByTime(4000))
}

test('manual recommendations display selected slides and independent cards in the configured order', () => {
  render(
    <SoftwareTestRouter>
      <SoftwareFeatured
        entries={entries}
        config={{ carousel: ['Editor', 'Browser'], tiles: ['Mail'] }}
      />
    </SoftwareTestRouter>
  )
  expect(screen.getByRole('heading', { name: 'Editor' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Show Mail recommendation' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mail' })).toHaveAttribute(
    'href',
    '/software/Mail'
  )
  expect(screen.getByRole('link', { name: 'Mail' })).not.toHaveAttribute(
    'download'
  )
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('an empty carousel still shows configured cards, and two empty areas hide the whole recommendation module', () => {
  const view = render(
    <SoftwareTestRouter>
      <SoftwareFeatured
        entries={entries}
        config={{ carousel: [], tiles: ['Mail'] }}
      />
    </SoftwareTestRouter>
  )
  expect(screen.getByRole('link', { name: 'Mail' })).toHaveAttribute(
    'href',
    '/software/Mail'
  )
  expect(
    screen.getByRole('link', { name: 'Download for Windows' })
  ).toHaveAttribute('href', entries[1].downloadUrl)
  expect(
    screen.queryByRole('heading', { name: 'Browser' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Next recommendation' })
  ).not.toBeInTheDocument()
  view.rerender(
    <SoftwareTestRouter>
      <SoftwareFeatured
        entries={entries}
        config={{ carousel: [], tiles: [] }}
      />
    </SoftwareTestRouter>
  )
  expect(
    screen.queryByRole('region', { name: 'Featured recommendations' })
  ).not.toBeInTheDocument()
})

test.each(['drip', '96b2ad63-7355-4fe9-b7e8-92a8ac85abd8'])(
  'a featured Drip recommendation %s offers the store without replacing its download',
  (id) => {
    render(
      <SoftwareTestRouter>
        <SoftwareFeatured entries={[{ ...entries[0], id }]} />
      </SoftwareTestRouter>
    )
    expect(
      screen.getByRole('link', { name: 'Visit the store' })
    ).toHaveAttribute('href', '/store')
    expect(
      screen.getByRole('link', { name: 'Download for Windows' })
    ).toHaveAttribute('href', entries[0].downloadUrl)
  }
)

test('recommendations advance automatically and wrap to the first app', () => {
  render(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries} />
    </SoftwareTestRouter>
  )
  expect(screen.getByRole('heading', { name: 'Browser' })).toBeVisible()
  act(() => vi.advanceTimersByTime(3999))
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('group', { name: 'Mail' })).not.toHaveAttribute(
    'inert'
  )
  expect(
    screen.getByRole('button', { name: 'Show Mail recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  advanceSlide()
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('hover and keyboard focus pause rotation without removing manual controls', () => {
  render(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries} />
    </SoftwareTestRouter>
  )
  const carousel = screen.getAllByRole('region', {
    name: 'Featured recommendations',
  })[1]
  fireEvent.mouseEnter(carousel)
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.mouseLeave(carousel)
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Mail recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  const next = screen.getByRole('button', { name: 'Next recommendation' })
  fireEvent.focusIn(next)
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Mail recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(next)
  expect(
    screen.getByRole('button', { name: 'Show Editor recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('mouse selection resumes automatically after leaving the card without a playback switch', () => {
  render(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries} />
    </SoftwareTestRouter>
  )
  expect(
    screen.queryByRole('button', { name: /automatic slideshow/ })
  ).not.toBeInTheDocument()
  const carousel = screen.getAllByRole('region', {
    name: 'Featured recommendations',
  })[1]
  const mail = screen.getByRole('button', {
    name: 'Show Mail recommendation',
  })
  fireEvent.mouseEnter(carousel)
  fireEvent.pointerDown(mail)
  fireEvent.focusIn(mail)
  fireEvent.pointerUp(mail)
  fireEvent.click(mail)
  advanceSlide()
  expect(mail).toHaveAttribute('aria-pressed', 'true')
  fireEvent.mouseLeave(carousel)
  act(() => vi.advanceTimersByTime(3999))
  expect(mail).toHaveAttribute('aria-pressed', 'true')
  act(() => vi.advanceTimersByTime(1))
  expect(
    screen.getByRole('button', { name: 'Show Editor recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('background tabs do not rotate and resume with a full reading interval', () => {
  render(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries} />
    </SoftwareTestRouter>
  )
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  hidden.mockReturnValue(false)
  fireEvent(document, new Event('visibilitychange'))
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Mail recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('reduced motion keeps recommendations manual and a single app has no rotation controls', () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  }))
  const view = render(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries} />
    </SoftwareTestRouter>
  )
  advanceSlide()
  expect(
    screen.getByRole('button', { name: 'Show Browser recommendation' })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.queryByRole('button', { name: 'Pause automatic slideshow' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Next recommendation' })
  ).toBeEnabled()
  view.rerender(
    <SoftwareTestRouter>
      <SoftwareFeatured entries={entries.slice(0, 1)} />
    </SoftwareTestRouter>
  )
  advanceSlide()
  expect(
    screen.queryByRole('button', { name: 'Next recommendation' })
  ).not.toBeInTheDocument()
})
