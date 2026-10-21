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
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { uploadDocImage, validateDocImageFile } from './api'
import { DocImage } from './content'
import { DocEditor } from './editor'
import { useDocImageUpload } from './image-upload'
import { newDocPage } from './types'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  uploadDocImage: vi.fn(),
}))

const photo = () =>
  new File(['test image'], 'screenshot.png', { type: 'image/png' })

describe('document image insertion', () => {
  it('merges a slow upload into the latest draft and inserts after the selected block', async () => {
    let finish!: (value: { url: string }) => void
    vi.mocked(uploadDocImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const page = newDocPage()
    page.blocks = [
      { ...page.blocks[0], id: 'first', text: 'first' },
      { ...page.blocks[0], id: 'last', text: 'last' },
    ]
    const change = vi.fn()
    const pending = vi.fn()
    const { result, rerender } = renderHook(
      ({ current }) => useDocImageUpload(current, change, pending),
      { initialProps: { current: page } }
    )
    let request!: Promise<void>
    act(() => {
      request = result.current.uploadFiles([photo()], 'first')
    })
    expect(pending).toHaveBeenLastCalledWith(true)
    rerender({
      current: {
        ...page,
        title: 'Title edited while upload was pending',
        blocks: page.blocks.map((b) => ({ ...b, text: `fresh ${b.text}` })),
      },
    })
    await act(async () => {
      finish({ url: '/api/docs/images/test-image' })
      await request
    })
    const saved = change.mock.lastCall?.[0]
    expect(saved.title).toBe('Title edited while upload was pending')
    expect(saved.blocks.map((b: { type: string }) => b.type)).toEqual([
      'text',
      'image',
      'text',
    ])
    expect(saved.blocks[0].text).toBe('fresh first')
    expect(saved.blocks[1].url).toBe('/api/docs/images/test-image')
    expect(saved.blocks[2].text).toBe('fresh last')
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('cancels an upload when leaving the editor and ignores its late response', async () => {
    let finish!: (value: { url: string }) => void
    let signal: AbortSignal | undefined
    vi.mocked(uploadDocImage).mockImplementationOnce((_file, abort) => {
      signal = abort
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const change = vi.fn()
    const { result, unmount } = renderHook(() =>
      useDocImageUpload(newDocPage(), change)
    )
    let request!: Promise<void>
    act(() => {
      request = result.current.uploadFiles([photo()])
    })
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      finish({ url: '/api/docs/images/late-image' })
      await request
    })
    expect(change).not.toHaveBeenCalled()
  })

  it('rejects empty, oversized and active-format files before uploading', () => {
    expect(() =>
      validateDocImageFile(new File([], 'empty.png', { type: 'image/png' }))
    ).toThrow('为空')
    expect(() =>
      validateDocImageFile(
        new File(['<svg/>'], 'active.svg', { type: 'image/svg+xml' })
      )
    ).toThrow('PNG')
    expect(() =>
      validateDocImageFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', {
          type: 'image/png',
        })
      )
    ).toThrow('5 MB')
    expect(() => validateDocImageFile(photo())).not.toThrow()
  })

  it('pastes image files at the focused block without intercepting plain text', async () => {
    vi.mocked(uploadDocImage).mockResolvedValueOnce({
      url: '/api/docs/images/pasted-image',
    })
    const page = newDocPage()
    page.blocks.push({ ...page.blocks[0], id: 'next', text: 'Next' })
    const change = vi.fn()
    render(<DocEditor page={page} onChange={change} busy={false} />)
    const input = screen.getByLabelText('内容块 1')
    fireEvent.focus(input)
    const textPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(textPaste, 'clipboardData', { value: { files: [] } })
    fireEvent(input, textPaste)
    expect(textPaste.defaultPrevented).toBe(false)
    fireEvent.paste(input, { clipboardData: { files: [photo()] } })
    await waitFor(() => expect(change).toHaveBeenCalled())
    expect(
      change.mock.lastCall?.[0].blocks.map((b: { type: string }) => b.type)
    ).toEqual(['text', 'image', 'text'])
  })

  it('drops multiple images below the target block in their original order', async () => {
    vi.mocked(uploadDocImage)
      .mockResolvedValueOnce({ url: '/api/docs/images/first-drop' })
      .mockResolvedValueOnce({ url: '/api/docs/images/second-drop' })
    const page = newDocPage()
    page.blocks.push({
      ...page.blocks[0],
      id: 'drop-target',
      text: 'Drop here',
    })
    const change = vi.fn()
    render(<DocEditor page={page} onChange={change} busy={false} />)
    fireEvent.drop(screen.getByLabelText('内容块 2'), {
      dataTransfer: { types: ['Files'], files: [photo(), photo()] },
    })
    await waitFor(() => expect(change).toHaveBeenCalledTimes(2))
    const next = change.mock.lastCall?.[0]
    expect(next.blocks.map((b: { type: string }) => b.type)).toEqual([
      'text',
      'text',
      'image',
      'image',
    ])
    expect(next.blocks.slice(-2).map((b: { url: string }) => b.url)).toEqual([
      '/api/docs/images/first-drop',
      '/api/docs/images/second-drop',
    ])
  })

  it('shows a large-image viewer with zoom controls and the original-image link', async () => {
    render(
      <DocImage
        url='https://skymoni.com/example.png'
        text='配置截图'
        admin={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '查看大图：配置截图' }))
    const dialog = await screen.findByRole('dialog', { name: '图片预览' })
    expect(dialog).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '放大图片' }))
    expect(screen.getByText('150%')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '打开原图' }).getAttribute('href')
    ).toBe('https://skymoni.com/example.png')
    fireEvent.click(screen.getByRole('button', { name: '适应窗口' }))
    expect(screen.getByText('100%')).toBeTruthy()
  })
})
