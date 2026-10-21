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
import { Gift, Megaphone, Eye, ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { TitledCard } from '@/components/ui/titled-card'
import { PopupContent } from '@/features/popup-notices/components/popup-content'

import type { PreviewData } from '../types'

export function PopupBenefitLink(props: {
  data: PreviewData
  benefitId: string
  onBenefit: (id: string) => void
  onRedeem: (code: string) => void
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(false)
  const [audience, setAudience] = useState('all')
  const [title, setTitle] = useState('一份创作资源，送给爱探索的你 ☁️')
  const [content, setContent] = useState(
    '### 今天，给灵感加一点旋律\n\n我们准备了一份 Muse 创作资源，每位领取者都会获得一份独立账号。\n\n点击下方按钮兑换，领取成功后可在 **我的仓库** 随时查看账号和使用说明。'
  )
  const [format, setFormat] = useState<'auto' | 'text' | 'markdown' | 'html'>(
    'markdown'
  )
  const [selectedCode, setSelectedCode] = useState('')
  const benefit = props.data.benefits.find((row) => row.id === props.benefitId)
  const codes = props.data.codes.filter(
    (row) => row.benefitId === props.benefitId && row.enabled
  )
  const code = codes.find((row) => row.code === selectedCode) ?? codes[0]
  return (
    <div className='space-y-6'>
      <div>
        <div className='mb-2 flex items-center gap-2 text-xs text-sky-600'>
          <Megaphone className='size-4' />
          {t('Announcements with a little extra')}
        </div>
        <h1 className='text-3xl font-semibold tracking-tight'>
          {t('Link a benefit to a popup')}
        </h1>
        <p className='text-muted-foreground mt-2 text-sm'>
          {t('Keep the existing popup editor and add a benefit claim button.')}
        </p>
      </div>
      <div className='grid gap-5 xl:grid-cols-[1.15fr_1fr]'>
        <TitledCard
          title={t('Popup settings')}
          icon={<Megaphone />}
          iconTone='info'
        >
          <div className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='linked-popup-title'>{t('Popup title')}</Label>
              <Input
                id='linked-popup-title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='linked-popup-audience'>{t('Recipients')}</Label>
                <NativeSelect
                  id='linked-popup-audience'
                  className='w-full'
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value='all'>{t('All signed-in users')}</option>
                  <option value='user'>{t('Preview user only')}</option>
                  <option value='guest'>{t('Visitors not signed in')}</option>
                </NativeSelect>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='linked-popup-format'>
                  {t('Content format')}
                </Label>
                <NativeSelect
                  id='linked-popup-format'
                  className='w-full'
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value='markdown'>Markdown</option>
                  <option value='html'>HTML</option>
                  <option value='text'>{t('Plain text')}</option>
                  <option value='auto'>{t('Auto detect')}</option>
                </NativeSelect>
              </div>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='linked-popup-content'>{t('Popup content')}</Label>
              <Textarea
                id='linked-popup-content'
                className='min-h-40'
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className='rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950'>
              <div className='mb-3 flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300'>
                <Gift className='size-4' />
                {t('Associated benefit')}
              </div>
              <div className='space-y-3'>
                <NativeSelect
                  className='w-full'
                  aria-label={t('Associated benefit')}
                  value={props.benefitId}
                  onChange={(e) => {
                    props.onBenefit(e.target.value)
                    setSelectedCode('')
                  }}
                >
                  {props.data.benefits.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  className='w-full'
                  aria-label={t('Associated code')}
                  value={code?.code ?? ''}
                  onChange={(e) => setSelectedCode(e.target.value)}
                >
                  {codes.map((row) => (
                    <option key={row.id} value={row.code}>
                      {row.code}
                    </option>
                  ))}
                </NativeSelect>
                {!code && (
                  <p className='text-muted-foreground text-xs'>
                    {t('Generate a code for this benefit first.')}
                  </p>
                )}
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Account details stay in the warehouse. The popup only shows the invitation to redeem.'
                  )}
                </p>
              </div>
            </div>
            <Button onClick={() => setPreview(true)}>
              <Eye />
              {t('Preview user popup')}
            </Button>
          </div>
        </TitledCard>
        <div className='space-y-5'>
          <TitledCard
            title={t('What the user sees')}
            icon={<Eye />}
            iconTone='info'
          >
            <div className='space-y-5'>
              <h2 className='text-lg font-semibold'>{title}</h2>
              <PopupContent content={content} format={format} />
              <div className='bg-muted/20 rounded-xl border p-4'>
                <p className='text-muted-foreground mb-1 text-xs'>
                  {t('Associated benefit')}
                </p>
                <p className='font-medium'>{benefit?.name}</p>
              </div>
              <Button
                className='w-full'
                disabled={!code}
                onClick={() => {
                  if (code) props.onRedeem(code.code)
                }}
              >
                <Gift />
                {t('Claim benefit')}
                <ArrowRight />
              </Button>
            </div>
          </TitledCard>
          <div className='bg-card rounded-2xl border p-5'>
            <h3 className='mb-4 text-sm font-medium'>{t('Delivery flow')}</h3>
            <ol className='space-y-4 text-sm'>
              {[
                t('User receives the popup'),
                t('Redeems the linked benefit code'),
                t('Independent content enters My warehouse'),
              ].map((step, index) => (
                <li key={step} className='flex items-center gap-3'>
                  <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs text-sky-600 dark:bg-sky-950'>
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      {preview && (
        <BenefitClaimPopup
          title={title}
          content={content}
          format={format}
          code={code?.code}
          guest={audience === 'guest'}
          onClose={() => setPreview(false)}
          onRedeem={props.onRedeem}
        />
      )}
    </div>
  )
}

export function BenefitClaimPopup(props: {
  title: string
  content: string
  format: 'auto' | 'text' | 'markdown' | 'html'
  code?: string
  guest?: boolean
  onClose: () => void
  onRedeem: (code: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      title={props.title}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      contentClassName='sm:max-w-xl'
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Later')}
          </Button>
          <Button
            disabled={!props.code}
            onClick={() => {
              props.onClose()
              if (props.code) props.onRedeem(props.code)
            }}
          >
            {props.guest ? t('Sign in to claim') : t('Claim benefit')}
            <ArrowRight />
          </Button>
        </>
      }
    >
      <div className='space-y-5'>
        <div className='flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950'>
          <Gift className='size-7' />
        </div>
        <PopupContent content={props.content} format={props.format} />
        {props.code && !props.guest && (
          <div className='bg-muted/20 flex items-center justify-between rounded-xl border p-3'>
            <div>
              <p className='text-muted-foreground text-xs'>
                {t('Benefit code')}
              </p>
              <code className='mt-1 block text-sm'>{props.code}</code>
            </div>
            <CopyButton value={props.code} />
          </div>
        )}
        <p className='text-muted-foreground flex items-center gap-2 text-xs'>
          <Check className='size-3.5 text-emerald-600' />
          {t('Find this benefit again in My warehouse after redemption.')}
        </p>
      </div>
    </Dialog>
  )
}
