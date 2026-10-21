import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { prepareHomeImage } from '../home-api'

const jpeg = 'data:image/jpeg;base64,dGVzdA=='
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }
let draw: ReturnType<typeof vi.fn>
let encode = vi.fn(() => jpeg)
let canvas: HTMLCanvasElement
beforeEach(() => {
  bitmap = { width: 800, height: 400, close: vi.fn() }
  draw = vi.fn()
  encode = vi.fn(() => jpeg)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  )
  canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: draw,
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(canvas, 'toDataURL').mockImplementation(encode)
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
    tag === 'canvas' ? canvas : create(tag, options)
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const file = () => new File(['picture'], 'picture.png', { type: 'image/png' })

test('a rectangular avatar is center-cropped and normalized to 256 square', async () => {
  expect(await prepareHomeImage(file(), true)).toBe(jpeg)
  expect([canvas.width, canvas.height]).toEqual([256, 256])
  expect(draw).toHaveBeenCalledWith(bitmap, 200, 0, 400, 400, 0, 0, 256, 256)
  expect(bitmap.close).toHaveBeenCalledOnce()
})
test('wide posters fit without stretching or cropping; both sides remain in frame', async () => {
  expect(await prepareHomeImage(file())).toBe(jpeg)
  expect([canvas.width, canvas.height]).toEqual([900, 1200])
  expect(draw).toHaveBeenCalledWith(bitmap, 0, 375, 900, 450)
})
test('tall and small images are accepted and fitted, not rejected by dimensions', async () => {
  bitmap.width = 100
  bitmap.height = 400
  await prepareHomeImage(file())
  expect(draw).toHaveBeenLastCalledWith(bitmap, 300, 0, 300, 1200)
  bitmap.width = 32
  bitmap.height = 16
  await prepareHomeImage(file(), true)
  expect(draw).toHaveBeenLastCalledWith(bitmap, 8, 0, 16, 16, 0, 0, 256, 256)
})
test('high-detail posters can fall back to a smaller valid 3:4 image within the server limit', async () => {
  encode.mockImplementation(() =>
    canvas.width === 900 ? `data:image/jpeg;base64,${'a'.repeat(400000)}` : jpeg
  )
  expect(await prepareHomeImage(file())).toBe(jpeg)
  expect([canvas.width, canvas.height]).toEqual([450, 600])
  expect(bitmap.close).toHaveBeenCalledOnce()
})
test('format, size and decoding errors remain understandable', async () => {
  await expect(
    prepareHomeImage(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))
  ).rejects.toThrow('5 MB')
  await expect(
    prepareHomeImage(new File([], 'empty.png', { type: 'image/png' }))
  ).rejects.toThrow('5 MB')
  await expect(
    prepareHomeImage(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      })
    )
  ).rejects.toThrow('5 MB')
  vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('bad image'))
  await expect(prepareHomeImage(file())).rejects.toThrow('无法读取这张图片')
})
