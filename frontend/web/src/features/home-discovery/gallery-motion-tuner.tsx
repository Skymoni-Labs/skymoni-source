import { useState } from 'react'

import { DEFAULT_GALLERY_MOTION } from './gallery-motion'
import type { GalleryMotion } from './vendor/portal-gallery'

export function GalleryMotionTuner({
  settings,
  onChange,
}: {
  settings: GalleryMotion
  onChange: (settings: GalleryMotion) => void
}) {
  const [copyState, setCopyState] = useState('')
  const amplitudePercent = Math.round(settings.amplitude * 1000)
  const period = ((Math.PI * 2) / settings.speed).toFixed(1)
  const config = JSON.stringify(settings)
  const change = (next: GalleryMotion) => {
    setCopyState('')
    onChange(next)
  }

  return (
    <aside
      className='hn-gallery-tuner'
      aria-label='本地卡片效果调节'
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className='hn-gallery-tuner-heading'>
        <strong>本地效果调节</strong>
        <span>拖动即生效 · 自动保留</span>
        <div className='hn-gallery-tuner-actions'>
          <button
            type='button'
            onClick={() => change({ ...DEFAULT_GALLERY_MOTION })}
          >
            恢复默认
          </button>
          <button
            type='button'
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `卡片起伏配置：${config}（幅度 ${amplitudePercent}%，约 ${period} 秒一轮）`
                )
                setCopyState('已复制，发给我即可')
              } catch {
                setCopyState('请选中下方配置文字复制')
              }
            }}
          >
            复制配置
          </button>
        </div>
      </div>
      <div className='hn-gallery-tuner-sliders'>
        <label>
          <span>
            起伏幅度 <b>{amplitudePercent}%</b>
          </span>
          <input
            type='range'
            aria-label='起伏幅度'
            aria-valuetext={`${amplitudePercent}%`}
            min={0}
            max={200}
            step={5}
            value={amplitudePercent}
            onChange={(event) =>
              change({
                ...settings,
                amplitude: Number(event.target.value) / 1000,
              })
            }
          />
        </label>
        <label>
          <span>
            起伏速度{' '}
            <b>
              {settings.speed.toFixed(2)} · {period} 秒/轮
            </b>
          </span>
          <input
            type='range'
            aria-label='起伏速度'
            aria-valuetext={`速度 ${settings.speed.toFixed(2)}，每轮 ${period} 秒`}
            min={0.1}
            max={3}
            step={0.05}
            value={settings.speed}
            onChange={(event) =>
              change({ ...settings, speed: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <div className='hn-gallery-tuner-footer'>
        <input
          aria-label='当前起伏配置'
          readOnly
          value={config}
          onClick={(event) => event.currentTarget.select()}
        />
        <span role='status'>
          {copyState || '悬浮卡片可暂停轮播，起伏继续。'}
        </span>
      </div>
    </aside>
  )
}
