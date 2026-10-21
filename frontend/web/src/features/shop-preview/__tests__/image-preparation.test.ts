import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { prepareProductImage } from '../lib/images'

const maxBytes = Math.floor((400000 - 'data:image/jpeg;base64,'.length) / 4) * 3
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }
let sizes: number[][]
let encode: (width: number, height: number) => number | null

beforeEach(() => {
  bitmap = { width: 2400, height: 1500, close: vi.fn() }
  sizes = []
  encode = () => 250000
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    function (this: HTMLCanvasElement, callback) {
      sizes.push([this.width, this.height])
      const bytes = encode(this.width, this.height)
      callback(
        bytes === null
          ? null
          : new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
      )
    }
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const file = () => new File(['picture'], 'picture.png', { type: 'image/png' })

test('detailed creator images shrink until their complete data URL fits the server limit', async () => {
  encode = (width, height) => Math.round(width * height * 0.8)
  const prepared = await prepareProductImage(file(), maxBytes)
  expect(sizes.length).toBeGreaterThan(1)
  expect(sizes[0]).toEqual([1600, 1000])
  expect(prepared.size).toBeLessThanOrEqual(maxBytes)
  expect(23 + 4 * Math.ceil(prepared.size / 3)).toBeLessThanOrEqual(400000)
  const [width, height] = sizes.at(-1) ?? []
  expect(width / height).toBeCloseTo(1.6, 2)
  expect(bitmap.close).toHaveBeenCalledOnce()
})
test('images already under the limit keep the existing dimensions and JPEG quality', async () => {
  bitmap.width = 800
  bitmap.height = 600
  await prepareProductImage(file(), maxBytes)
  expect(sizes).toEqual([[800, 600]])
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
    expect.any(Function),
    'image/jpeg',
    0.85
  )
})
test('shop uploads retain their original preparation without the creator limit', async () => {
  encode = () => 800000
  expect((await prepareProductImage(file())).size).toBe(800000)
  expect(sizes).toEqual([[1600, 1000]])
})
test.each([null, 800000])(
  'failed or non-shrinking encoding (%s) releases the bitmap instead of accepting an oversized image',
  async (bytes) => {
    encode = () => bytes
    await expect(prepareProductImage(file(), maxBytes)).rejects.toThrow()
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(sizes.length).toBeLessThanOrEqual(8)
  }
)
