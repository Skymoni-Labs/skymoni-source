import {
  Cloud,
  Monitor,
  Moon,
  MousePointer2,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/context/theme-provider'
import { useMediaQuery } from '@/hooks/use-media-query'

import {
  appearanceKey,
  readAppearance,
  saveAppearance,
  type CommunityAppearancePreferences,
} from './appearance-preferences'
import { attachPointerMotion } from './pointer-motion'
import {
  CommunitySkyDecorations,
  SkyDecorationSettings,
} from './sky-decorations'

function PointerAtmosphere({
  preferences,
}: {
  preferences: CommunityAppearancePreferences
}) {
  const { resolvedTheme } = useTheme()
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const canvas = useRef<HTMLCanvasElement>(null)
  const motion =
    fine && !reduced && preferences.effects && preferences.cursor !== 'native'
  useEffect(() => {
    const root = document.documentElement
    const before = root.getAttribute('data-sky-cursor')
    root.setAttribute('data-sky-cursor', fine ? preferences.cursor : 'native')
    return () => {
      if (before === null) root.removeAttribute('data-sky-cursor')
      else root.setAttribute('data-sky-cursor', before)
    }
  }, [fine, preferences.cursor])
  useEffect(() => {
    if (!motion || !canvas.current) return
    return attachPointerMotion(
      canvas.current,
      resolvedTheme === 'dark',
      preferences.cursor === 'star'
    )
  }, [motion, preferences.cursor, resolvedTheme])
  return motion
    ? createPortal(
        <div className='sky-pointer-atmosphere' aria-hidden='true' inert>
          <canvas ref={canvas} className='sky-pointer-canvas' />
        </div>,
        document.body
      )
    : null
}

export function CommunityAppearance() {
  const { theme, setTheme } = useTheme()
  const [preferences, setPreferences] = useState(readAppearance)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const update = (next: CommunityAppearancePreferences) => {
    setPreferences(next)
    saveAppearance(next)
  }
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === appearanceKey) setPreferences(readAppearance())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return (
    <>
      <CommunitySkyDecorations />
      <PointerAtmosphere preferences={preferences} />
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              aria-label='外观与鼠标'
              title='外观与鼠标'
            />
          }
        >
          <Sparkles className='size-[1.15rem]' />
        </PopoverTrigger>
        <PopoverContent align='end' className='sky-appearance-panel'>
          <div className='sky-appearance-heading'>
            <span className='sky-appearance-emblem'>
              <Cloud />
            </span>
            <div>
              <strong>挑一片喜欢的天空</strong>
              <p>外观与鼠标 · 为你的灵感留白</p>
            </div>
          </div>
          <fieldset>
            <legend>界面主题</legend>
            <div className='sky-appearance-choices'>
              {(
                [
                  { id: 'light', name: '云间晴昼', icon: Sun },
                  { id: 'dark', name: '星海夜航', icon: Moon },
                  { id: 'system', name: '跟随系统', icon: Monitor },
                ] as const
              ).map((item) => (
                <button
                  type='button'
                  key={item.id}
                  aria-pressed={theme === item.id}
                  onClick={() => setTheme(item.id)}
                  className={`sky-theme-choice sky-theme-${item.id}`}
                >
                  <item.icon />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>鼠标风格</legend>
            <div className='sky-appearance-choices'>
              {(
                [
                  { id: 'cloud', name: '云朵', icon: Cloud },
                  { id: 'star', name: '星芒', icon: Sparkles },
                  { id: 'native', name: '系统', icon: MousePointer2 },
                ] as const
              ).map((item) => (
                <button
                  type='button'
                  key={item.id}
                  aria-pressed={preferences.cursor === item.id}
                  onClick={() => update({ ...preferences, cursor: item.id })}
                  className='sky-cursor-choice'
                >
                  {item.id === 'native' ? (
                    <item.icon />
                  ) : (
                    <img
                      src={`/branding/cursor-${item.id}.svg`}
                      alt=''
                      width={30}
                      height={30}
                    />
                  )}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className='sky-effects-setting'>
            <div>
              <Label htmlFor='sky-pointer-effects'>轨迹与点击星屑</Label>
              <p>
                {reduced
                  ? '已跟随系统减少动态效果'
                  : '轻轻跟随，停下时自然消散'}
              </p>
            </div>
            <Switch
              id='sky-pointer-effects'
              checked={preferences.effects}
              disabled={reduced}
              onCheckedChange={(effects) => update({ ...preferences, effects })}
            />
          </div>
          <SkyDecorationSettings />
          <p className='sky-appearance-footnote'>
            偏好会保存在此设备，手机端使用系统触控。
          </p>
        </PopoverContent>
      </Popover>
    </>
  )
}
