// Keep the outer boundary and the flat centre neutral. Refraction rises and
// falls inside the glass instead of becoming a displaced, opaque-looking rim.
export const HEADER_REFRACTION_SCALE = -10

export function createHeaderLensMap(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > 4096 ||
    height > 256
  ) {
    throw new RangeError('Invalid header lens dimensions')
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  const radius = Math.min(width, height) / 2
  const rimWidth = Math.min(12, radius * 0.45)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5,
        py = y + 0.5
      const centerX = Math.max(radius, Math.min(width - radius, px))
      const dx = px - centerX,
        dy = py - height / 2
      const distance = Math.hypot(dx, dy)
      const depth = radius - distance
      const t = Math.min(1, Math.max(0, depth / rimWidth))
      // A smooth bump has zero slope at both boundaries, avoiding a visible
      // seam where the refracted part meets the undistorted centre.
      const strength = 16 * t * t * (1 - t) * (1 - t) * 96
      const index = (y * width + x) * 4
      pixels[index] = 128 + (distance ? dx / distance : 0) * strength
      pixels[index + 1] = 128 + (distance ? dy / distance : 0) * strength
      pixels[index + 2] = 128
      pixels[index + 3] = 255
    }
  }
  return pixels
}
