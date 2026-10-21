import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { PublicHeaderLinks } from './public-header-glass'

let resize: () => void
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Links({ active = 'home' }: { active?: string }) {
  return (
    <PublicHeaderLinks>
      <a href='/' aria-current={active === 'home' ? 'page' : undefined}>
        Home
      </a>
      <a
        href='/creators'
        aria-current={active === 'creators' ? 'page' : undefined}
      >
        Creators
      </a>
    </PublicHeaderLinks>
  )
}
function position() {
  const home = screen.getByText('Home')
  const creators = screen.getByText('Creators')
  Object.defineProperties(home, {
    offsetLeft: { value: 0 },
    offsetWidth: { value: 50 },
  })
  Object.defineProperties(creators, {
    offsetLeft: { value: 52 },
    offsetWidth: { value: 90 },
  })
  const group = creators.parentElement
  const pill = group?.querySelector<HTMLElement>('.public-header-link-pill')
  if (!group || !pill) throw new Error('Navigation capsule missing')
  return {
    home,
    creators,
    group,
    pill,
  }
}
test('hover survives parent rerenders and resize; leaving restores the active page', () => {
  const view = render(<Links />)
  const { creators, group, pill } = position()
  fireEvent.pointerOver(creators)
  expect(pill.style.transform).toBe('translateX(52px)')
  view.rerender(<Links />)
  resize()
  expect(pill.style.transform).toBe('translateX(52px)')
  fireEvent.pointerOver(group)
  expect(pill.style.transform).toBe('translateX(52px)')
  fireEvent.pointerLeave(group)
  expect(pill.style.transform).toBe('translateX(0px)')
})
test('keyboard focus survives rerenders and pointer exit', () => {
  const view = render(<Links />)
  const { creators, group, pill } = position()
  fireEvent.focus(creators)
  view.rerender(<Links />)
  resize()
  fireEvent.pointerLeave(group)
  expect(pill.style.transform).toBe('translateX(52px)')
  fireEvent.blur(creators, { relatedTarget: document.body })
  expect(pill.style.transform).toBe('translateX(0px)')
})
test('route updates move the resting capsule to the new active page', () => {
  const view = render(<Links />)
  const { pill } = position()
  view.rerender(<Links active='creators' />)
  expect(pill.style.transform).toBe('translateX(52px)')
})
