import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'

import { CommunityAppearance } from '../appearance'
import { appearanceKey, readAppearance } from '../appearance-preferences'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
  localStorage.clear()
  document.cookie = 'vite-ui-theme=; Max-Age=0; Path=/'
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.classList.remove('light', 'dark')
})
function mount() {
  return render(
    <ThemeProvider>
      <CommunityAppearance />
    </ThemeProvider>
  )
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: '外观与鼠标' }))
}

test('fresh visitors default to daylight and can still choose the dark theme', async () => {
  mount()
  await open()
  expect(screen.getByRole('button', { name: '云间晴昼' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await userEvent.click(screen.getByRole('button', { name: '星海夜航' }))
  expect(document.documentElement).toHaveClass('dark')
  expect(document.cookie).toContain('vite-ui-theme=dark')
})

test('native pointer opt-out and effect preference survive reopening the page', async () => {
  const view = mount()
  await open()
  await userEvent.click(screen.getByRole('button', { name: /^系统$/ }))
  await userEvent.click(screen.getByRole('switch', { name: '轨迹与点击星屑' }))
  expect(readAppearance()).toEqual({ cursor: 'native', effects: false })
  view.unmount()
  mount()
  await open()
  expect(screen.getByRole('button', { name: /^系统$/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(
    screen.getByRole('switch', { name: '轨迹与点击星屑' })
  ).toHaveAttribute('aria-checked', 'false')
})

test('reduced motion prevents the animated layer while retaining accessible settings', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') || query.includes('pointer: fine'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
  mount()
  await open()
  expect(document.querySelector('.sky-pointer-atmosphere')).toBeNull()
  expect(
    screen.getByRole('switch', { name: '轨迹与点击星屑' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText('已跟随系统减少动态效果')).toBeInTheDocument()
})

test('touch environments keep the native pointer and do not create a canvas', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
  const view = mount()
  expect(document.documentElement).toHaveAttribute('data-sky-cursor', 'native')
  expect(document.querySelector('.sky-pointer-canvas')).toBeNull()
  view.unmount()
  expect(document.documentElement).not.toHaveAttribute('data-sky-cursor')
})

test('invalid saved settings use usable defaults and a storage event refreshes other tabs', async () => {
  localStorage.setItem(appearanceKey, '{invalid')
  expect(readAppearance()).toEqual({ cursor: 'cloud', effects: true })
  mount()
  await open()
  localStorage.setItem(
    appearanceKey,
    JSON.stringify({ cursor: 'star', effects: false })
  )
  fireEvent(window, new StorageEvent('storage', { key: appearanceKey }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '星芒' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  expect(
    screen.getByRole('switch', { name: '轨迹与点击星屑' })
  ).toHaveAttribute('aria-checked', 'false')
})
