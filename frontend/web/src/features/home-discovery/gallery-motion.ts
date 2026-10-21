import type { GalleryMotion } from './vendor/portal-gallery'

export const DEFAULT_GALLERY_MOTION: GalleryMotion = {
  amplitude: 0.13,
  speed: 1.65,
}
export const GALLERY_MOTION_STORAGE = 'skymoni:local-gallery-motion:v1'

export function isLocalGalleryPreview() {
  return (
    typeof window !== 'undefined' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)
  )
}

export function loadGalleryMotion(): GalleryMotion {
  if (!isLocalGalleryPreview()) return DEFAULT_GALLERY_MOTION
  try {
    const stored = JSON.parse(
      localStorage.getItem(GALLERY_MOTION_STORAGE) || 'null'
    )
    if (
      stored &&
      Number.isFinite(stored.amplitude) &&
      Number.isFinite(stored.speed)
    ) {
      return {
        amplitude: Math.max(0, Math.min(0.2, stored.amplitude)),
        speed: Math.max(0.1, Math.min(3, stored.speed)),
      }
    }
  } catch {
    // Preview tuning is optional when browser storage is unavailable.
  }
  return DEFAULT_GALLERY_MOTION
}
