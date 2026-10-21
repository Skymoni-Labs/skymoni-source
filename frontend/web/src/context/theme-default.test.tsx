import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ThemeProvider, useTheme } from './theme-provider'

function Controls() {
  const { theme, setTheme, resetTheme } = useTheme()
  return (
    <>
      <span>{theme}</span>
      <button type='button' onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button type='button' onClick={resetTheme}>
        Reset
      </button>
    </>
  )
}
beforeEach(() => {
  document.cookie = 'vite-ui-theme=; path=/; max-age=0'
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
})
afterEach(() => {
  cleanup()
  document.cookie = 'vite-ui-theme=; path=/; max-age=0'
  vi.restoreAllMocks()
})
test('new visitors default to light even on a dark OS; reset returns to light', async () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  )
  expect(screen.getByText('light')).toBeInTheDocument()
  expect(document.documentElement).toHaveClass('light')
  await userEvent.click(screen.getByRole('button', { name: 'Dark' }))
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(document.documentElement).toHaveClass('light')
  expect(document.documentElement.style.colorScheme).toBe('light')
})
test.each(['dark', 'light', 'system'])(
  'keeps the explicit %s visitor preference',
  (theme) => {
    document.cookie = `vite-ui-theme=${theme}; path=/`
    render(
      <ThemeProvider>
        <Controls />
      </ThemeProvider>
    )
    expect(screen.getByText(theme)).toBeInTheDocument()
    expect(document.documentElement).toHaveClass(
      theme === 'system' ? 'light' : theme
    )
  }
)
