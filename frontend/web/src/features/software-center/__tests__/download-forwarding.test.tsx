import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { getForwardedDownload } from '../download-forwarding'
import catalog from '../preview-catalog.json'
import { SoftwareAction } from '../software-card'
import type { SoftwareEntry } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replace('{{name}}', values?.name || '{{name}}'),
  }),
}))
afterEach(cleanup)

test('only reviewed external installer URLs use a same-site relay', () => {
  const installer = (catalog.items as SoftwareEntry[]).find(
    (item) => item.id === 'v2rayng'
  )?.downloads?.[0]
  expect(installer).toBeDefined()
  expect(getForwardedDownload(installer!.url)).toMatch(
    /^\/software-downloads\/[a-f0-9]{32}\//
  )
  for (const url of [
    'https://evil.invalid/test.exe',
    'https://github.com/new/project/latest.exe',
    '/drip-releases/Drip.exe',
    'https://pan.quark.cn/s/6b1b64af1949',
  ]) {
    expect(getForwardedDownload(url)).toBeUndefined()
  }
})

test('both software pages can render the relay and retain the exact original link', async () => {
  const entry = (catalog.items as SoftwareEntry[]).find(
    (item) => item.id === 'v2rayng'
  )!
  render(<SoftwareAction entry={entry} featured />)
  await userEvent
    .setup()
    .click(
      screen.getByRole('button', {
        name: `Choose a platform for ${entry.name}`,
      })
    )
  const direct = entry.downloads![0]
  const relay = screen.getByRole('menuitem', {
    name: new RegExp(
      `^${direct.platform} · ${direct.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    ),
  })
  expect(relay).toHaveAttribute('href', getForwardedDownload(direct.url))
  expect(relay).toHaveAttribute('download', direct.filename)
  expect(
    screen.getByRole('menuitem', {
      name: `Original download for ${entry.name} · ${direct.platform} · ${direct.label}`,
    })
  ).toHaveAttribute('href', direct.url)
})
