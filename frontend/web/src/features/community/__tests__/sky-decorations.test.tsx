import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  CommunitySkyDecorations,
  DaylightCloudBackground,
  SkyCloudCompanion,
  SkyDecorationSettings,
  SkyObservatory,
  skyDecorationKey,
} from '../sky-decorations'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})
function mount() {
  return render(
    <>
      <CommunitySkyDecorations />
      <DaylightCloudBackground />
      <SkyCloudCompanion />
      <SkyObservatory />
      <SkyDecorationSettings />
    </>
  )
}
test('decorations can be disabled across surfaces and the preference persists', async () => {
  const view = mount()
  expect(document.querySelector('.sky-observatory')).not.toBeNull()
  await userEvent.click(
    screen.getByRole('switch', { name: '天空装饰与云朵伙伴' })
  )
  expect(localStorage.getItem(skyDecorationKey)).toBe('off')
  expect(document.querySelector('.sky-decoration-layer')).toBeNull()
  expect(document.querySelector('.sky-cloud-background')).toBeNull()
  expect(document.querySelector('.sky-observatory')).toBeNull()
  view.unmount()
  mount()
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  localStorage.removeItem(skyDecorationKey)
  fireEvent(window, new StorageEvent('storage', { key: skyDecorationKey }))
  expect(document.querySelector('.sky-observatory')).not.toBeNull()
})
test('cloud greeting responds to click and can collapse without affecting navigation', async () => {
  mount()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '和云朵打个招呼' }))
  expect(screen.getByRole('status')).toHaveTextContent('收到一朵云的问候')
  await userEvent.click(screen.getByRole('button', { name: '和云朵打个招呼' }))
  expect(screen.getByRole('status')).toHaveTextContent('慢慢来')
  await userEvent.click(screen.getByRole('button', { name: '收起云朵伙伴' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
test('visibility and reduced motion pause the shared scene and cleanup restores document state', () => {
  const view = mount()
  expect(document.documentElement).toHaveAttribute('data-sky-paused', 'false')
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(document.documentElement).toHaveAttribute('data-sky-paused', 'true')
  view.unmount()
  expect(document.documentElement).not.toHaveAttribute('data-sky-paused')
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: media.includes('reduce'),
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
  mount()
  expect(document.querySelector('.sky-decoration-layer')).toHaveAttribute(
    'data-paused',
    'true'
  )
})
test('storage failure still permits disabling the decorative layer', async () => {
  mount()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  await userEvent.click(screen.getByRole('switch'))
  expect(document.querySelector('.sky-decoration-layer')).toBeNull()
  expect(document.querySelector('.sky-cloud-background')).toBeNull()
  expect(document.querySelector('.sky-observatory')).toBeNull()
})
