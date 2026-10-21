/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Download, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SubscriptionFormatCard(props: {
  format: 'SUB' | 'JSON' | 'CLASH'
  url: string
  label: string
  description: string
  filename: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const [showQr, setShowQr] = useState(false)
  const qrTitle = t('{{format}} subscription QR code', { format: props.format })

  return (
    <section className='border-border/70 bg-muted/20 space-y-2 rounded-2xl border p-3 sm:p-4'>
      <div className='flex items-center gap-2'>
        <Badge variant='secondary' className='shrink-0 font-mono text-[10px]'>
          {props.format}
        </Badge>
        <label
          htmlFor={id}
          className='text-muted-foreground text-xs font-medium'
        >
          {props.label}
        </label>
      </div>
      <p className='text-muted-foreground text-[11px] leading-relaxed'>
        {props.description}
      </p>
      <Input
        id={id}
        aria-label={props.label}
        value={props.url}
        readOnly
        autoComplete='off'
        className='bg-background/30 text-foreground h-9 min-w-0 rounded-xl px-3 font-mono text-xs'
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className='grid grid-cols-3 gap-2'>
        <CopyButton
          value={props.url}
          variant='default'
          size='default'
          aria-label={t('Copy {{format}} subscription', {
            format: props.format,
          })}
          className='h-9 min-w-0 rounded-xl px-2 text-xs'
        >
          {t('Copy link')}
        </CopyButton>
        <Button
          variant='outline'
          render={
            <a
              href={props.url}
              download={props.filename}
              referrerPolicy='no-referrer'
            />
          }
          aria-label={t('Download {{format}} subscription', {
            format: props.format,
          })}
          className='h-9 min-w-0 rounded-xl bg-transparent px-2 text-xs'
        >
          <Download />
          {t('Download')}
        </Button>
        <Button
          type='button'
          variant='outline'
          aria-expanded={showQr}
          aria-label={t(
            showQr ? 'Hide {{format}} QR code' : 'Show {{format}} QR code',
            { format: props.format }
          )}
          onClick={() => setShowQr((value) => !value)}
          className='h-9 min-w-0 rounded-xl bg-transparent px-2 text-xs'
        >
          <QrCode />
          {t('QR code')}
        </Button>
      </div>
      {showQr && (
        <div className='flex flex-col items-center gap-2 pt-2'>
          <div className='rounded-xl bg-white p-3'>
            <QRCodeSVG
              value={props.url}
              size={180}
              marginSize={1}
              title={qrTitle}
            />
          </div>
          <span className='text-muted-foreground text-xs'>{qrTitle}</span>
        </div>
      )}
    </section>
  )
}
