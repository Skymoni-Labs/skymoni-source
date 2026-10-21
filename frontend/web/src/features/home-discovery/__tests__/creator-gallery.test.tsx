import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Work } from '@/features/creator-center/types'

import { CreatorGallery } from '../creator-gallery'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.PropsWithChildren<{
    to: string
    params: { workId: string }
  }>) => (
    <a {...props} href={to.replace('$workId', params.workId)}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/creator-center/components/cover-art', () => ({
  CoverArt: () => <div>Poster artwork</div>,
}))

const works = Array.from({ length: 4 }, (_, index) => ({
  id: `test-${index}`,
  title: `Project ${index}`,
  summary: `Description ${index}`,
  category: 'website',
  author: 'Creator',
})) as Work[]

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        )
      }
      disconnect() {}
    }
  )
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  )
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(
    window.clearTimeout
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup() {
  render(<CreatorGallery works={works} />)
  const gallery = screen.getByRole('region', { name: '创作者作品展架' })
  const stage = gallery.querySelector('.hn-gallery-stage') as HTMLElement
  stage.setPointerCapture = vi.fn()
  stage.hasPointerCapture = () => false
  return {
    gallery,
    stage,
  }
}

function pointer(target: Element, type: string, x = 100) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: 100,
    button: 0,
  })
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    pointerId: { value: 1 },
    isPrimary: { value: true },
  })
  fireEvent(target, event)
}

function advance() {
  act(() => vi.advanceTimersByTime(4000))
}

test('background, arrows and caption focus keep autoplay running', () => {
  const { gallery, stage } = setup()
  pointer(gallery, 'pointerover')
  fireEvent.focus(screen.getByRole('button', { name: '下一个作品' }))
  expect(gallery).toHaveAttribute('data-playing', 'true')
  advance()
  expect(Number(gallery.getAttribute('data-position'))).toBeCloseTo(1)
  fireEvent.focus(screen.getByRole('link', { name: /查看作品：/ }))
  // Pressing empty space without dragging also leaves playback alone.
  pointer(stage, 'pointerdown')
  expect(gallery).toHaveAttribute('data-playing', 'true')
  advance()
  expect(Number(gallery.getAttribute('data-position'))).toBeCloseTo(2)
  pointer(stage, 'pointerup')
  expect(gallery).toHaveAttribute('data-playing', 'true')
})

test('hover pauses only the card and leaving it resumes playback', () => {
  const { gallery } = setup()
  const card = screen.getByRole('link', { name: 'Project 0，查看作品' })
  pointer(card, 'pointerover')
  expect(gallery).toHaveAttribute('data-playing', 'false')
  advance()
  expect(gallery).toHaveAttribute('data-position', '0.000')
  pointer(card, 'pointerout')
  expect(gallery).toHaveAttribute('data-playing', 'true')
  advance()
  expect(Number(gallery.getAttribute('data-position'))).toBeCloseTo(1)
})

test('dragging pauses continuously and releasing in empty space resumes', () => {
  const { gallery, stage } = setup()
  stage.setPointerCapture = vi.fn()
  stage.hasPointerCapture = () => false
  pointer(stage, 'pointerdown', 400)
  pointer(stage, 'pointermove', 280)
  expect(gallery).toHaveAttribute('data-dragging', 'true')
  expect(gallery).toHaveAttribute('data-playing', 'false')
  const position = gallery.getAttribute('data-position')
  advance()
  expect(gallery).toHaveAttribute('data-position', position)
  pointer(stage, 'pointerup', 280)
  expect(gallery).toHaveAttribute('data-dragging', 'false')
  expect(gallery).toHaveAttribute('data-playing', 'true')
  advance()
  expect(Number(gallery.getAttribute('data-position'))).toBeCloseTo(2)
})
