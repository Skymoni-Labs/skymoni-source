import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AnimateInView } from './animate-in-view'

let intersect: IntersectionObserverCallback
let observed: Element
let reducedMotion = false

beforeEach(() => {
  reducedMotion = false
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: reducedMotion }) as MediaQueryList
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback
      }
      observe(element: Element) {
        observed = element
      }
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function visible(value: boolean) {
  act(() =>
    intersect(
      [
        {
          isIntersecting: value,
          target: observed,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    )
  )
}
function finish(element: Element) {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: 'landing-fade-up' })
  fireEvent(element, event)
}

test('marks a finished reveal for layer release without hiding its content', () => {
  render(
    <AnimateInView>
      <span>Copy</span>
    </AnimateInView>
  )
  const element = screen.getByText('Copy').parentElement
  if (!element) throw new Error('Reveal wrapper missing')
  visible(true)
  expect(element).not.toHaveClass('opacity-0')
  finish(element)
  expect(element).toHaveAttribute('data-entrance-settled', 'true')
  expect(element).not.toHaveClass('opacity-0')
})
test('child animations do not settle the wrapper; repeat reveals reset the marker', () => {
  render(
    <AnimateInView once={false}>
      <span>Copy</span>
    </AnimateInView>
  )
  const child = screen.getByText('Copy')
  const element = child.parentElement
  if (!element) throw new Error('Reveal wrapper missing')
  visible(true)
  finish(child)
  expect(element).not.toHaveAttribute('data-entrance-settled')
  finish(element)
  expect(element).toHaveAttribute('data-entrance-settled', 'true')
  visible(false)
  expect(element).not.toHaveAttribute('data-entrance-settled')
  expect(element).toHaveClass('opacity-0')
  visible(true)
  expect(element).not.toHaveClass('opacity-0')
})
test('reduced motion settles immediately without waiting for an animation event', () => {
  reducedMotion = true
  render(
    <AnimateInView>
      <span>Copy</span>
    </AnimateInView>
  )
  const element = screen.getByText('Copy').parentElement
  expect(element).toHaveAttribute('data-entrance-settled', 'true')
  expect(element).not.toHaveClass('opacity-0')
})
