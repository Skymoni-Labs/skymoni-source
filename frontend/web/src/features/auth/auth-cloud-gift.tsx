import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

// Public gift shown on the sign-in and sign-up companion.
// Redemption remains a user action in the authenticated wallet.
const giftCode = 'KFC666'

export function AuthCloudGift({ onRestart }: { onRestart: () => void }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef(0)
  const activePointer = useRef<number | null>(null)
  const revealedRef = useRef(false)
  const [revealed, setRevealed] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      revealedRef.current = true
      setRevealed(true)
      return
    }
    // Use layout size, so the arrival animation never shrinks the bitmap.
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.globalCompositeOperation = 'source-over'
    const fill = context.createLinearGradient(0, 0, width, height)
    fill.addColorStop(0, '#d4edf6')
    fill.addColorStop(0.55, '#bce2ef')
    fill.addColorStop(1, '#dceff2')
    context.fillStyle = fill
    context.fillRect(0, 0, width, height)
    context.textAlign = 'center'
    context.fillStyle = '#6f9fb1'
    context.font = '700 12px sans-serif'
    const instruction = t('Scratch the cloud with your finger or mouse')
    const fontSize = Math.min(
      12,
      (12 * (width - 20)) / context.measureText(instruction).width
    )
    context.font = `700 ${fontSize}px sans-serif`
    context.fillText(instruction, width / 2, height / 2 + 8)
    context.font = '20px sans-serif'
    context.fillText('✦', width / 2, height / 2 - 22)
    strokes.current = 0
    activePointer.current = null
  }, [t])

  useEffect(() => {
    if (revealed) return
    paint()
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [paint, revealed])

  const reveal = () => {
    revealedRef.current = true
    activePointer.current = null
    setRevealed(true)
  }

  const scratch = (event: PointerEvent<HTMLDivElement>, start: boolean) => {
    if (revealedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * canvas.clientWidth) / rect.width
    const y = ((event.clientY - rect.top) * canvas.clientHeight) / rect.height
    context.globalCompositeOperation = 'destination-out'
    context.lineWidth = 44
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (start) {
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + 0.01, y + 0.01)
    } else {
      context.lineTo(x, y)
    }
    context.stroke()
    // Sample the alpha channel rather than counting clicks: short strokes
    // cannot accidentally reveal an unscratched card.
    if (++strokes.current % 8 !== 0) return
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let clear = 0
    let total = 0
    for (let index = 3; index < pixels.length; index += 32) {
      total++
      if (pixels[index] < 30) clear++
    }
    if (total && clear / total > 0.43) reveal()
  }

  const resetScratch = () => {
    revealedRef.current = false
    setCopyState('idle')
    if (revealed) setRevealed(false)
    else paint()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(giftCode)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const status = () => {
    if (copyState === 'copied') return t('Gift code copied')
    if (copyState === 'failed') return t('Select and copy the gift code')
    if (revealed) return t('You found the gift!')
    return t('Try scratching the cloud')
  }

  return (
    <section className='auth-cloud-gift' aria-label={t('Cloud gift')}>
      <small>SKYMONI / A LITTLE GIFT</small>
      <h3>{t('Three stars found. Scratch your cloud gift!')}</h3>
      <div
        className='auth-cloud-scratch-box'
        onPointerDown={(event) => {
          if (revealedRef.current || activePointer.current !== null) return
          event.preventDefault()
          activePointer.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          scratch(event, true)
        }}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId) {
            scratch(event, false)
          }
        }}
        onPointerUp={() => {
          activePointer.current = null
        }}
        onPointerCancel={() => {
          activePointer.current = null
        }}
        onLostPointerCapture={() => {
          activePointer.current = null
        }}
      >
        <div className='auth-cloud-scratch-under' aria-hidden={!revealed}>
          <span>{t('Your gift code')}</span>
          <strong>{giftCode}</strong>
          <small>{t('Sign in to redeem it in your wallet')}</small>
        </div>
        {!revealed && (
          <canvas
            ref={canvasRef}
            className='auth-cloud-scratch-canvas'
            aria-label={t('Scratch the cloud with your finger or mouse')}
          />
        )}
      </div>
      <div className='auth-cloud-gift-actions'>
        <span role='status'>{status()}</span>
        <button type='button' onClick={revealed ? copy : reveal}>
          {revealed ? t('Copy gift code') : t('Reveal directly')}
        </button>
        <button type='button' onClick={resetScratch}>
          {t('Scratch again')}
        </button>
      </div>
      <div className='auth-cloud-gift-footer'>
        <button type='button' onClick={onRestart}>
          {t('Find stars again')}
        </button>
        {revealed && <a href='/wallet'>{t('Go to wallet')} ↗</a>}
      </div>
    </section>
  )
}
