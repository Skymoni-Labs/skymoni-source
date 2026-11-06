import { expect, test } from 'vitest'

import {
  createHeaderLensMap,
  HEADER_REFRACTION_SCALE,
} from './public-header-lens'

test('the flat centre remains undistorted while the inside of the rim refracts', () => {
  const width = 600,
    height = 56
  const map = createHeaderLensMap(width, height)
  const pixel = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return [map[i], map[i + 1], map[i + 2], map[i + 3]]
  }
  expect(pixel(300, 28)).toEqual([128, 128, 128, 255])
  expect(pixel(300, 18)).toEqual([128, 128, 128, 255])
  const outerShift = Math.abs(
    (pixel(300, 0)[1] / 255 - 0.5) * HEADER_REFRACTION_SCALE
  )
  const innerShift = Math.abs(
    (pixel(300, 5)[1] / 255 - 0.5) * HEADER_REFRACTION_SCALE
  )
  expect(outerShift).toBeLessThan(0.15)
  expect(innerShift).toBeGreaterThan(2)
  expect(innerShift).toBeLessThan(4)
})

test('the lens remains symmetric, bounded and opaque across resized capsule shapes', () => {
  for (const [width, height] of [
    [600, 56],
    [1200, 56],
    [320, 56],
    [240, 48],
  ]) {
    const map = createHeaderLensMap(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4,
          vertical = ((height - 1 - y) * width + x) * 4,
          horizontal = (y * width + width - 1 - x) * 4
        expect(map[i] + map[horizontal]).toBeGreaterThanOrEqual(255)
        expect(map[i] + map[horizontal]).toBeLessThanOrEqual(257)
        expect(map[i + 1] + map[vertical + 1]).toBeGreaterThanOrEqual(255)
        expect(map[i + 1] + map[vertical + 1]).toBeLessThanOrEqual(257)
        expect(
          Math.abs((map[i] / 255 - 0.5) * HEADER_REFRACTION_SCALE)
        ).toBeLessThan(4)
        expect(
          Math.abs((map[i + 1] / 255 - 0.5) * HEADER_REFRACTION_SCALE)
        ).toBeLessThan(4)
        expect(map[i + 2]).toBe(128)
        expect(map[i + 3]).toBe(255)
      }
    }
  }
})

test('invalid or unbounded dimensions are rejected before allocating the lens', () => {
  for (const [width, height] of [
    [0, 56],
    [600, -1],
    [1e6, 56],
    [600, 1e6],
    [12.5, 56],
    [Number.NaN, 56],
  ]) {
    expect(() => createHeaderLensMap(width, height)).toThrow(RangeError)
  }
})
