import { CherryStudio } from '@lobehub/icons'
import { Mail, Package } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { publicPreviewProducts } from '@/features/shop-public-preview/catalog'
import { cn } from '@/lib/utils'

import type { SoftwareEntry } from './types'

export function SoftwareArtwork(props: {
  entry: SoftwareEntry
  large?: boolean
}) {
  const { t } = useTranslation()
  const entry = props.entry
  const [failedSrc, setFailedSrc] = useState('')
  let art = <Package aria-hidden='true' />
  if (entry.appearance === 'drip') {
    art = props.large ? (
      <div className='sc-browser-preview'>
        <div className='sc-browser-bar'>
          <i />
          <i />
          <i />
          <span>Drip Browser</span>
          <img src='/static/software/drip-0.3.28.png' alt='' loading='lazy' />
        </div>
        <img
          src={publicPreviewProducts[0].coverUrl}
          alt={t('Drip Browser new tab preview')}
        />
      </div>
    ) : (
      <img src='/static/software/drip-0.3.28.png' alt='' loading='lazy' />
    )
  } else if (entry.appearance === 'mail') {
    art = (
      <img
        src='/static/software/skymoni-mail-1.4.1.png'
        alt=''
        loading='lazy'
      />
    )
  } else if (entry.appearance === 'cherry') {
    art = <CherryStudio.Color aria-hidden />
  } else if (entry.appearance === 'cc') {
    art = (
      <span className='sc-cc-mark' aria-hidden='true'>
        ✳
      </span>
    )
  }
  const customImage = Boolean(entry.imageUrl && failedSrc !== entry.imageUrl)
  if (customImage) {
    art = (
      <img
        src={entry.imageUrl}
        alt=''
        loading='lazy'
        onError={() => setFailedSrc(entry.imageUrl)}
      />
    )
  }
  return (
    <div
      className={cn(
        'sc-artwork',
        `sc-artwork-${entry.appearance}`,
        props.large && 'sc-artwork-large',
        customImage && 'sc-artwork-custom'
      )}
    >
      {props.large && entry.appearance === 'mail' && (
        <>
          <span
            className='sc-mail-sheet sc-mail-sheet-back'
            aria-hidden='true'
          />
          <span className='sc-mail-sheet' aria-hidden='true'>
            <Mail />
          </span>
        </>
      )}
      {art}
    </div>
  )
}
