import { useEffect, useId, useRef } from 'react'

// Apply the reviewed edge lens only while the login or registration layout is mounted.
// The separate background pseudo-element never filters text or artwork.
const SURFACES = '.sky-auth-card'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_ACTIVE_LENSES = 1
const MAX_MAP_SIZE = 384

type Surface = {
  visible: boolean
  filter: SVGFilterElement | null
  image: SVGFEImageElement | null
  geometry: string
}

function makeLensMap(width: number, height: number, corner: number) {
  const downsample = Math.min(1, MAX_MAP_SIZE / Math.max(width, height))
  const w = Math.max(2, Math.round(width * downsample))
  const h = Math.max(2, Math.round(height * downsample))
  const radius = Math.min(corner * downsample, w / 2, h / 2)
  const rim = Math.max(2, 8 * downsample)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d')
  if (!context) return null
  const pixels = context.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2
      const dy = y + 0.5 - h / 2
      const qx = Math.abs(dx) - (w / 2 - radius)
      const qy = Math.abs(dy) - (h / 2 - radius)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const length = Math.hypot(ox, oy)
      const distance = length + Math.min(Math.max(qx, qy), 0) - radius
      let nx = 0
      let ny = 0
      if (length > 0) {
        nx = (ox / length) * Math.sign(dx)
        ny = (oy / length) * Math.sign(dy)
      } else if (qx > qy) {
        nx = Math.sign(dx)
      } else {
        ny = Math.sign(dy)
      }
      const bend = Math.max(0, 1 - Math.max(0, -distance) / rim) ** 2
      const index = (y * w + x) * 4
      pixels.data[index] = 128 + nx * bend * 104
      pixels.data[index + 1] = 128 + ny * bend * 104
      pixels.data[index + 2] = 128
      pixels.data[index + 3] = 255
    }
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

export function AuthGlassRefraction() {
  const prefix = `auth-lens-${useId().replaceAll(/[^a-zA-Z0-9_-]/g, '')}`
  const definitions = useRef<SVGDefsElement>(null)

  useEffect(() => {
    const defs = definitions.current
    // Parsing url() alone does not establish SVG backdrop support in WebKit/Gecko.
    if (
      !defs ||
      !CSS.supports('backdrop-filter', `url(#${prefix})`) ||
      /Firefox|^((?!Chrome|Chromium).)*Safari/.test(navigator.userAgent)
    ) {
      return
    }
    const desktop = matchMedia('(min-width: 641px)')
    const transparency = matchMedia('(prefers-reduced-transparency: reduce)')
    const contrast = matchMedia('(prefers-contrast: more)')
    const surfaces = new Map<HTMLElement, Surface>()
    const maps = new Map<string, string>()
    let frame = 0
    let sequence = 0
    let needsScan = true

    const enabled = () =>
      document.documentElement.classList.contains('dark') &&
      desktop.matches &&
      !transparency.matches &&
      !contrast.matches

    const release = (element: HTMLElement, state: Surface) => {
      state.filter?.remove()
      state.filter = null
      state.image = null
      state.geometry = ''
      element.removeAttribute('data-auth-glass-rim')
      element.removeAttribute('data-auth-glass-positioned')
      element.style.removeProperty('--auth-glass-rim-filter')
    }

    const render = () => {
      let active = 0
      for (const [element, state] of surfaces) {
        const width = Math.round(element.clientWidth)
        const height = Math.round(element.clientHeight)
        if (
          !enabled() ||
          !state.visible ||
          width < 64 ||
          height < 40 ||
          width * height > 900_000 ||
          active >= MAX_ACTIVE_LENSES
        ) {
          release(element, state)
          continue
        }
        active++
        const style = getComputedStyle(element)
        const corner = Number.parseFloat(style.borderTopLeftRadius) || 16
        const geometry = `${width}:${height}:${corner}`
        if (geometry === state.geometry) continue
        let map = maps.get(geometry)
        if (!map) {
          map = makeLensMap(width, height, corner) || undefined
          if (!map) continue
          const oldest = maps.keys().next().value
          if (maps.size >= 4 && oldest) maps.delete(oldest)
          maps.set(geometry, map)
        }
        if (!state.filter) {
          const id = `${prefix}-${++sequence}`
          const filter = document.createElementNS(SVG_NS, 'filter')
          filter.id = id
          for (const [name, value] of Object.entries({
            x: '0%',
            y: '0%',
            width: '100%',
            height: '100%',
            'color-interpolation-filters': 'sRGB',
          })) {
            filter.setAttribute(name, value)
          }
          const image = document.createElementNS(SVG_NS, 'feImage')
          image.setAttribute('width', '100%')
          image.setAttribute('height', '100%')
          image.setAttribute('preserveAspectRatio', 'none')
          image.setAttribute('result', 'lens')
          const displacement = document.createElementNS(
            SVG_NS,
            'feDisplacementMap'
          )
          displacement.setAttribute('in', 'SourceGraphic')
          displacement.setAttribute('in2', 'lens')
          displacement.setAttribute('scale', '-16')
          displacement.setAttribute('xChannelSelector', 'R')
          displacement.setAttribute('yChannelSelector', 'G')
          filter.append(image, displacement)
          defs.append(filter)
          state.filter = filter
          state.image = image
          if (style.position === 'static') {
            element.setAttribute('data-auth-glass-positioned', '')
          }
          element.style.setProperty('--auth-glass-rim-filter', `url("#${id}")`)
          element.setAttribute('data-auth-glass-rim', '')
        }
        state.image?.setAttribute('href', map)
        state.geometry = geometry
      }
    }

    const scan = () => {
      const candidates = new Set(
        [...document.querySelectorAll<HTMLElement>(SURFACES)].filter(
          (element) => {
            if (element.parentElement?.closest(SURFACES)) return false
            // Preserve existing decorative pseudo-elements and moving artwork.
            if (element.closest('.cg-stage,.cg-scene,.hn-hero-scene')) {
              return false
            }
            const content = getComputedStyle(element, '::after').content
            return (
              element.hasAttribute('data-auth-glass-rim') ||
              content === 'none' ||
              content === 'normal'
            )
          }
        )
      )
      for (const [element, state] of surfaces) {
        if (candidates.has(element)) continue
        release(element, state)
        intersection.unobserve(element)
        resize.unobserve(element)
        surfaces.delete(element)
      }
      for (const element of candidates) {
        if (surfaces.has(element)) continue
        surfaces.set(element, {
          visible: false,
          filter: null,
          image: null,
          geometry: '',
        })
        intersection.observe(element)
      }
    }

    const schedule = (rescan = false) => {
      needsScan ||= rescan
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (needsScan) {
          needsScan = false
          scan()
        }
        render()
      })
    }

    const resize = new ResizeObserver(() => schedule())
    const intersection = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        const state = surfaces.get(element)
        if (!state) continue
        state.visible = entry.isIntersecting
        if (state.visible) resize.observe(element)
        else resize.unobserve(element)
      }
      schedule()
    })
    const mutation = new MutationObserver((records) => {
      if (records.some((record) => !defs.contains(record.target))) {
        schedule(true)
      }
    })
    const theme = new MutationObserver(() => schedule(true))
    const preferenceChanged = () => schedule(true)
    mutation.observe(document.body, { childList: true, subtree: true })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    for (const media of [desktop, transparency, contrast]) {
      media.addEventListener('change', preferenceChanged)
    }
    schedule(true)

    return () => {
      cancelAnimationFrame(frame)
      mutation.disconnect()
      theme.disconnect()
      intersection.disconnect()
      resize.disconnect()
      for (const media of [desktop, transparency, contrast]) {
        media.removeEventListener('change', preferenceChanged)
      }
      for (const [element, state] of surfaces) release(element, state)
      maps.clear()
    }
  }, [prefix])

  return (
    <svg
      className='auth-glass-filter-definitions'
      aria-hidden='true'
      focusable='false'
    >
      <defs ref={definitions} />
    </svg>
  )
}
