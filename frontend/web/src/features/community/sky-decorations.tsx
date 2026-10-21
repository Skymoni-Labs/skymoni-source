import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useMediaQuery } from '@/hooks/use-media-query'

export const skyDecorationKey = 'skymoni:sky-decorations:v1'
const changedEvent = 'skymoni:sky-decorations-change'
function readEnabled() {
  try {
    return localStorage.getItem(skyDecorationKey) !== 'off'
  } catch {
    return true
  }
}
function useSkyDecorations() {
  const [enabled, setEnabled] = useState(readEnabled)
  useEffect(() => {
    const sync = () => setEnabled(readEnabled())
    const storage = (event: StorageEvent) => {
      if (event.key === skyDecorationKey || event.key === null) sync()
    }
    const changed = (event: Event) =>
      setEnabled((event as CustomEvent<boolean>).detail)
    window.addEventListener(changedEvent, changed)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(changedEvent, changed)
      window.removeEventListener('storage', storage)
    }
  }, [])
  return {
    enabled,
    update(value: boolean) {
      setEnabled(value)
      try {
        localStorage.setItem(skyDecorationKey, value ? 'on' : 'off')
      } catch {
        /* Local preference still works without storage. */
      }
      window.dispatchEvent(new CustomEvent(changedEvent, { detail: value }))
    },
  }
}

export function SkyDecorationSettings() {
  const { enabled, update } = useSkyDecorations()
  return (
    <div className='sky-effects-setting'>
      <div>
        <Label htmlFor='sky-decorations'>天空装饰与云朵伙伴</Label>
        <p>漂浮光点、观测窗和一朵会回应的云</p>
      </div>
      <Switch id='sky-decorations' checked={enabled} onCheckedChange={update} />
    </div>
  )
}

/** A background-only cloud layer; ordinary cards and text paint above it. */
export function DaylightCloudBackground() {
  const { enabled } = useSkyDecorations()
  return enabled ? (
    <div className='sky-cloud-background' aria-hidden='true' inert>
      {[0, 1, 2, 3].map((index) => (
        <svg
          key={index}
          className='sky-soft-cloud'
          viewBox='0 0 420 160'
          fill='none'
        >
          <path
            d='M40 136C3 136 0 92 36 83 29 39 90 12 121 49 148 6 211 20 218 65 257 38 306 56 309 94 355 80 394 105 388 136Z'
            className='sky-soft-cloud-body'
          />
          <path
            d='M39 136c65-12 109 4 161-2s118-10 188 2c-90 13-262 15-349 0Z'
            className='sky-soft-cloud-shade'
          />
          <path
            d='M45 85c-4-31 38-52 66-26M143 52c19-30 59-22 66 11'
            className='sky-soft-cloud-rim'
          />
        </svg>
      ))}
    </div>
  ) : null
}

/** Original skymoni vector art: a little observatory above the cloud sea. */
export function SkyObservatory() {
  const { enabled } = useSkyDecorations()
  return enabled ? (
    <div className='sky-observatory' aria-hidden='true' inert>
      <svg viewBox='0 0 290 180' fill='none'>
        <ellipse
          cx='150'
          cy='156'
          rx='111'
          ry='12'
          className='sky-scene-shadow'
        />
        <path
          d='M46 126c-13-20 2-47 28-44 8-32 55-32 67-4 22-11 48 6 44 30 21-3 33 21 19 35H52c-8-3-10-10-6-17Z'
          className='sky-scene-cloud sky-scene-cloud-back'
        />
        <g className='sky-window'>
          <path
            d='M116 40a44 44 0 0 1 88 0v93h-88Z'
            className='sky-window-frame'
          />
          <path
            d='M124 42a36 36 0 0 1 72 0v83h-72Z'
            className='sky-window-glass'
          />
          <circle cx='160' cy='44' r='13' className='sky-window-sun' />
          <path
            d='M175 27c-16 2-21 21-7 29-21 5-32-21-15-32 6-3 14-2 22 3Z'
            className='sky-window-moon'
          />
          <path
            d='m138 34 1 3 3 1-3 1-1 3-1-3-3-1 3-1Zm44 34 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z'
            className='sky-window-stars'
          />
          <path
            d='M124 105c15-13 24 11 40-1s19-7 32-13v34h-72Z'
            className='sky-window-hill'
          />
          <path d='M160 10v115M120 77h80' className='sky-window-bar' />
          <path d='M109 132h102' className='sky-window-sill' />
        </g>
        <g className='sky-scene-plane'>
          <path
            d='m39 54 48-14-14 37-11-15-23-8Z'
            className='sky-plane-paper'
          />
          <path d='m62 62 25-22-15 20' className='sky-plane-fold' />
          <path d='M31 63c-28 15-9 39 10 24' className='sky-plane-trail' />
        </g>
        <path
          d='M74 140c-7-15 7-29 22-22 6-26 44-26 53-2 17-8 36 6 31 23 14-6 31 5 28 16H83c-7-2-10-8-9-15Z'
          className='sky-scene-cloud sky-scene-cloud-front'
        />
        <g className='sky-hanging-star'>
          <path d='M236 22v44' className='sky-star-string' />
          <path
            d='m236 60 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z'
            className='sky-star-charm'
          />
        </g>
        <path
          d='m96 25 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm130 98 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z'
          className='sky-scene-sparkle'
        />
      </svg>
      <span>SKYMONI · LITTLE OBSERVATORY</span>
    </div>
  ) : null
}

const greetings = [
  '今天，也有好点子在发芽。',
  '收到一朵云的问候 ☁',
  '慢慢来，灵感正在靠近。',
  '把你的发现，分享给同路的人。',
]
export function CommunitySkyDecorations() {
  const { enabled } = useSkyDecorations()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => {
    const root = document.documentElement
    const before = root.getAttribute('data-sky-paused')
    root.setAttribute('data-sky-paused', reduced || hidden ? 'true' : 'false')
    return () => {
      if (before === null) root.removeAttribute('data-sky-paused')
      else root.setAttribute('data-sky-paused', before)
    }
  }, [reduced, hidden])
  useEffect(() => {
    const visibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  return enabled
    ? createPortal(
        <div
          className='sky-decoration-layer'
          data-paused={reduced || hidden ? 'true' : 'false'}
        >
          <div className='sky-ambient-field' aria-hidden='true' inert>
            {Array.from({ length: 16 }, (_, index) => (
              <i
                key={index}
                className={`sky-drift sky-drift-${index % 3}`}
                style={{
                  left: `${(index * 31 + 7) % 100}%`,
                  top: `${(index * 19 + 12) % 90}%`,
                  width: `${6 + (index % 4) * 5}px`,
                  height: `${6 + (index % 4) * 5}px`,
                  animationDelay: `${-index * 2.3}s`,
                  animationDuration: `${18 + (index % 5) * 4}s`,
                }}
              />
            ))}
            <span className='sky-shooting-star' />
            <span className='sky-shooting-star sky-shooting-star-second' />
            <svg
              className='sky-horizon-cloud'
              viewBox='0 0 320 120'
              fill='none'
            >
              <path d='M1 112c-5-27 27-44 48-29 0-54 82-66 102-17 33-28 75-6 73 23 39-16 80 2 88 25' />
            </svg>
          </div>
        </div>,
        document.body
      )
    : null
}

export function SkyCloudCompanion() {
  const { enabled } = useSkyDecorations()
  const [greeting, setGreeting] = useState(0)
  const [companionOpen, setCompanionOpen] = useState(false)
  return enabled ? (
    <div className='sky-cloud-companion' data-open={companionOpen}>
      {companionOpen && (
        <button
          type='button'
          className='sky-cloud-dismiss'
          aria-label='收起云朵伙伴'
          onClick={() => setCompanionOpen(false)}
        >
          <X size={12} />
        </button>
      )}
      {companionOpen && (
        <div className='sky-cloud-message' role='status' aria-live='polite'>
          {greetings[greeting % greetings.length]}
        </div>
      )}
      <button
        type='button'
        className='sky-cloud-greet'
        aria-label='和云朵打个招呼'
        onClick={() => {
          setCompanionOpen(true)
          setGreeting((value) => value + 1)
        }}
      >
        <svg viewBox='0 0 128 100' aria-hidden='true'>
          <ellipse
            cx='64'
            cy='90'
            rx='34'
            ry='5'
            className='sky-companion-shadow'
          />
          <g className='sky-companion-body' key={greeting}>
            <path
              d='M27 69C8 66 8 40 28 36c-1-28 37-37 49-13 24-11 46 13 33 34 12 14 2 27-14 27H34c-9 0-14-7-7-15Z'
              className='sky-companion-cloud'
            />
            <ellipse
              cx='44'
              cy='59'
              rx='7'
              ry='4'
              className='sky-companion-blush'
            />
            <ellipse
              cx='84'
              cy='59'
              rx='7'
              ry='4'
              className='sky-companion-blush'
            />
            <path
              d='M49 49v5m29-5v5M59 60q5 6 10 0'
              className='sky-companion-face'
            />
            <path
              d='m94 24 3-7 4 6 8 1-6 5 1 7-7-4-6 3 1-7-5-5Z'
              className='sky-companion-star'
            />
          </g>
        </svg>
        <span>
          打个招呼 <span aria-hidden='true'>↗</span>
        </span>
      </button>
    </div>
  ) : null
}
