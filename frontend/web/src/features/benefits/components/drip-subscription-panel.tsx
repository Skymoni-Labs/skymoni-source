import {
  ArrowUpRight,
  ChevronDown,
  Command,
  KeyRound,
  Layers3,
  LifeBuoy,
  Monitor,
  Network,
  Shield,
  Smartphone,
} from 'lucide-react'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

import type { WarehouseItem } from '../types'
import { SubscriptionFormatCard } from './subscription-format-card'

export function DripSubscriptionPanel(props: {
  item: WarehouseItem
  clashUrl: string
  universalUrl: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [showGuide, setShowGuide] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const code = props.item.fields.find((field) => field.id === 'code')
  const jsonUrl =
    /^https:\/\/[^/?#]+\/api\/drip\/sub\/sub\/[A-Za-z0-9_-]{8,128}$/.test(
      props.universalUrl
    )
      ? props.universalUrl.replace('/api/drip/sub/sub/', '/api/drip/sub/json/')
      : null
  const clients = [
    {
      name: 'Clash',
      platform: 'Windows · macOS · Android',
      icon: Monitor,
      primary: true,
      label: t('Import to Clash (Windows, macOS, Android)'),
      href: `clash://install-config?url=${encodeURIComponent(props.clashUrl)}&name=skymoni`,
    },
    {
      name: 'Shadowrocket',
      platform: 'iOS',
      icon: Smartphone,
      label: t('Import to Shadowrocket (iOS)'),
      href: `shadowrocket://add/${encodeURIComponent(props.universalUrl)}`,
    },
    {
      name: 'Stash',
      platform: 'iOS · macOS',
      icon: Layers3,
      label: t('Import to Stash'),
      href: `stash://install-config?url=${encodeURIComponent(props.clashUrl)}`,
    },
    {
      name: 'Surge',
      platform: t('Temporarily unavailable'),
      icon: Shield,
      disabled: true,
      label: t('Import to Surge (unavailable)'),
      title: t('Surge does not support the current VLESS nodes'),
    },
    {
      name: 'Quantumult X',
      platform: t('Temporarily unavailable'),
      icon: Command,
      disabled: true,
      label: t('Import to Quantumult X (unavailable)'),
      title: t('Quantumult X needs a dedicated subscription format'),
    },
  ]

  return (
    <Dialog
      open
      title={
        <span className='flex items-center gap-3'>
          <IconBadge tone='primary' size='lg' className='rounded-2xl'>
            <Network />
          </IconBadge>
          <span className='space-y-1'>
            <span
              aria-hidden
              className='text-muted-foreground block text-[10px] font-medium tracking-[0.18em]'
            >
              SKYMONI · DRIP
            </span>
            <span className='block'>{t('Subscription panel')}</span>
          </span>
        </span>
      }
      description={t('Choose your app and import the subscription.')}
      initialFocus={false}
      titleClassName='text-xl font-semibold tracking-tight'
      descriptionClassName='mt-1 text-sm leading-relaxed'
      contentClassName='drip-subscription-panel gap-4 rounded-3xl sm:max-w-[548px] sm:p-6'
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <div className='space-y-4'>
        <div className='space-y-3'>
          <SubscriptionFormatCard
            format='SUB'
            url={props.universalUrl}
            label={t('Universal subscription address')}
            description={t(
              'Shadowrocket (iOS), v2rayNG (Android), v2rayN and other clients supporting node subscriptions.'
            )}
            filename='skymoni.txt'
          />
          {jsonUrl && (
            <SubscriptionFormatCard
              format='JSON'
              url={jsonUrl}
              label={t('JSON subscription address')}
              description={t(
                'For clients supporting Xray JSON configurations. This is not a sing-box configuration.'
              )}
              filename='skymoni.json'
            />
          )}
          <SubscriptionFormatCard
            format='CLASH'
            url={props.clashUrl}
            label={t('Clash subscription address')}
            description={t(
              'Clash / Mihomo on Windows, macOS and Android; Stash on iOS.'
            )}
            filename='skymoni.yaml'
          />
          <p className='text-muted-foreground px-1 text-xs leading-relaxed'>
            {t(
              'These formats share the same package balance and expiry. Choose the format supported by your app.'
            )}
          </p>
        </div>
        <section className='space-y-3'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-muted-foreground text-xs font-medium'>
              {t('Client apps')}
            </h3>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-label={
                showGuide
                  ? t('Hide import guide')
                  : t('Need help? View import guide')
              }
              aria-expanded={showGuide}
              onClick={() => setShowGuide((current) => !current)}
              className='text-muted-foreground h-7 gap-1.5 rounded-lg px-2 text-xs'
            >
              <LifeBuoy className='size-3.5' />
              {t('Import guide')}
            </Button>
          </div>
          <div className='grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2'>
            {clients.map((client) => (
              <Button
                key={client.name}
                type='button'
                variant='ghost'
                render={client.href ? <a href={client.href} /> : undefined}
                disabled={client.disabled}
                aria-label={client.label}
                title={client.title}
                className={`border-border/70 bg-muted/20 text-foreground hover:border-primary/40 hover:bg-primary/10 h-auto min-w-0 justify-start gap-2 rounded-2xl border px-3 py-3 text-start transition-colors sm:gap-3 sm:px-4 ${client.primary ? 'border-primary/25 bg-primary/5 min-[360px]:col-span-2' : ''} ${client.disabled ? 'border-dashed' : ''}`}
              >
                <span
                  className={`border-border/70 bg-muted/40 text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-xl border sm:size-9 [&>svg]:size-4 ${client.primary ? 'border-primary/20 bg-primary/10 text-primary' : ''}`}
                >
                  <client.icon />
                </span>
                <span className='min-w-0 flex-1 space-y-1'>
                  <span className='block text-xs font-medium sm:text-sm'>
                    {client.name}
                  </span>
                  <span className='text-muted-foreground block text-[11px] font-normal'>
                    {client.platform}
                  </span>
                </span>
                {client.primary && (
                  <ArrowUpRight className='text-muted-foreground size-4 shrink-0' />
                )}
              </Button>
            ))}
          </div>
        </section>
        {showGuide && (
          <div className='text-muted-foreground border-border/70 bg-muted/20 space-y-3 rounded-2xl border p-4 text-sm leading-relaxed'>
            <p>
              {t(
                'If one-click import does not open the app, copy the link and add it as a remote subscription manually.'
              )}
            </p>
            <p>
              {t(
                'Use the Clash link for Clash and Stash. Use the universal link for Shadowrocket.'
              )}
            </p>
            <CopyButton
              value={props.universalUrl}
              variant='outline'
              size='default'
              aria-label={t('Copy universal subscription link')}
              className='w-full rounded-xl bg-transparent'
            >
              {t('Copy universal subscription link')}
            </CopyButton>
          </div>
        )}
        {code && (
          <div className='border-border/70 border-t pt-3'>
            <Button
              type='button'
              variant='outline'
              aria-label={t('Drip redemption code')}
              aria-expanded={showCode}
              onClick={() => setShowCode((current) => !current)}
              className='bg-muted/20 h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-start'
            >
              <KeyRound className='text-muted-foreground size-4 shrink-0' />
              <span className='min-w-0 flex-1 space-y-1'>
                <span className='block text-sm font-medium'>
                  {t('Drip redemption code')}
                </span>
                <span className='text-muted-foreground block text-xs font-normal'>
                  {t('Sync this purchase to Drip')}
                </span>
              </span>
              <ChevronDown
                className={`text-muted-foreground size-4 shrink-0 transition-transform ${showCode ? 'rotate-180' : ''}`}
              />
            </Button>
            {showCode && (
              <div className='border-border/70 bg-muted/20 mt-3 space-y-3 rounded-2xl border p-4'>
                <p className='text-muted-foreground text-xs leading-relaxed'>
                  {t(
                    'The redemption code only syncs this purchase to a Drip account; it does not add traffic again.'
                  )}
                </p>
                <code className='bg-background/30 block rounded-xl border p-3 text-sm break-all'>
                  {code.value}
                </code>
                <CopyButton
                  value={code.value}
                  variant='outline'
                  size='default'
                  aria-label={t('Copy redemption code')}
                  className='w-full rounded-xl bg-transparent'
                >
                  {t('Copy redemption code')}
                </CopyButton>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
