/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AppDownload, ConsoleEntry } from '../app-download'
import { parseAndroidRelease } from '../app-release'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: { value: string; title: string }) => (
    <svg data-destination={props.value}>
      <title>{props.title}</title>
    </svg>
  ),
}))
const release = {
  package: 'com.skymoni.mobile',
  platform: 'Android',
  version: '1.1.16',
  available: true,
  status: 'published',
  url: 'https://skymoni.com/app-releases/skymoni-1.1.16.apk',
  sha256: 'a'.repeat(64),
  signing_certificate_sha256:
    '92f62d96f7c13e38230477b0394e98234b69820379b6981c19e6cbe4225b9e48',
}
const response = (value: unknown) => ({ ok: true, json: async () => value })
beforeEach(() =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(release)))
)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('official App distribution', () => {
  test('loads the live signed release with a QR entry instead of a bundled version', async () => {
    render(<AppDownload />)
    const link = await screen.findByRole('link', {
      name: 'Download for Android',
    })
    expect(link).toHaveAttribute('href', '/app-releases/skymoni-1.1.16.apk')
    expect(link).toHaveAttribute('download', 'skymoni-1.1.16.apk')
    expect(screen.getByText('Officially available.')).toBeInTheDocument()
    expect(
      screen.getByTitle('Scan to open the official app download page')
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/app-releases\/release.json\?check=/),
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' })
    )
  })
  test('honors maintenance metadata and never presents an old download link', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        ...release,
        available: false,
        status: 'maintenance',
      }) as Response
    )
    render(<AppDownload />)
    expect(
      await screen.findByRole('button', { name: 'App under maintenance' })
    ).toBeDisabled()
    expect(
      screen.queryByRole('link', { name: 'Download for Android' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTitle('Scan to open the official app download page')
    ).not.toBeInTheDocument()
  })
  test('offers a retry after a metadata failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    render(<AppDownload />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('link', { name: 'Download for Android' })
    ).toBeInTheDocument()
  })
  test('rejects an unexpected package, unsigned release, or external APK', () => {
    for (const invalid of [
      { ...release, package: 'admin' },
      { ...release, sha256: '' },
      { ...release, signing_certificate_sha256: 'wrong' },
      { ...release, url: 'https://example.com/app.apk' },
    ]) {
      expect(() => parseAndroidRelease(invalid)).toThrow()
    }
  })
  test('labels illustrations without exposing fake controls', async () => {
    render(<AppDownload />)
    await screen.findByRole('link', { name: 'Download for Android' })
    expect(
      screen.getByRole('img', { name: 'Illustrative skymoni mobile screens' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sign in|Send|Choose model/ })
    ).not.toBeInTheDocument()
  })
  test('opens the existing console using a safe new tab', () => {
    render(<ConsoleEntry />)
    const link = screen.getByRole('link', { name: /Open the console/ })
    expect(link).toHaveAttribute('href', '/dashboard')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
