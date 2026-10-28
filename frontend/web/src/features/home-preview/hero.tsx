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
import { Anthropic, DeepSeek, Gemini, OpenAI } from '@lobehub/icons'
import {
  Archive,
  ArrowDown,
  ArrowRight,
  Boxes,
  Mail,
  Palette,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrackingCloud } from '@/features/home-discovery/tracking-cloud'
import { SupportedApplications } from '@/features/home/components/supported-applications'

import { ConsoleEntry } from './app-download'

import '@/styles/hero-card-clarity.css'

function FloatingServiceCard({
  children,
  className,
  ...props
}: ComponentProps<'a'>) {
  return (
    <a {...props} className={`${className} hp-floating-sharp`}>
      {/* Retain intrinsic layout and a single accessible link name. */}
      <div className='hp-floating-content hp-floating-layout'>{children}</div>
      {/* Rasterize at twice the size before continuous composited movement. */}
      <div className='hp-floating-content hp-floating-hires' aria-hidden='true'>
        {children}
      </div>
    </a>
  )
}

export function PreviewIntro() {
  const { t } = useTranslation()
  return (
    <div className='hp-hero-copy'>
      <Badge variant='outline' className='hp-eyebrow'>
        <Sparkles size={13} aria-hidden='true' />
        {t('Models. Tools. Resources.')}
      </Badge>
      <h1 id='home-heading'>
        {t('More possibilities with AI.')}
        <br />
        <span>{t('All connected in skymoni.')}</span>
      </h1>
      <p className='hp-hero-description'>
        {t(
          'From model APIs to Drip Browser, your own email and digital resources. Bring the pieces of your AI workflow together in skymoni.'
        )}
      </p>
      <div className='hp-hero-actions'>
        <Button
          className='group h-11 rounded-lg px-5 text-sm font-medium'
          render={<a href='#services' />}
        >
          {t('Explore skymoni')}
          <ArrowDown
            className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-y-0.5'
            aria-hidden='true'
          />
        </Button>
        <Button
          variant='outline'
          className='text-foreground border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
          render={
            <a href='/dashboard' target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('Open the console')}
          <ArrowRight className='ml-1.5 size-4' aria-hidden='true' />
        </Button>
      </div>
      <div className='hp-hero-footnote'>
        <span>{t('Model access')}</span>
        <i />
        <span>{t('Digital products')}</span>
        <i />
        <span>{t('One account')}</span>
      </div>
      <SupportedApplications className='hp-supported-apps' />
    </div>
  )
}

export function PreviewHero({
  creatorEntry = false,
  trackingEyes = false,
}: { creatorEntry?: boolean; trackingEyes?: boolean } = {}) {
  const { t } = useTranslation()
  return (
    <section
      className='hp-hero-wrap'
      aria-label={t('The skymoni service ecosystem')}
    >
      <div className='hp-hero-wash' aria-hidden='true' />
      <div className='hp-container hp-ecosystem-hero'>
        <div
          className='hp-universe'
          aria-label={t('The skymoni service ecosystem')}
        >
          <div className='hp-universe-grid' aria-hidden='true' />
          <div className='hp-universe-orbits' aria-hidden='true'>
            <i />
            <i />
            <i />
            <b />
            <b />
          </div>
          <div className='hp-cloud-core'>
            <div className='hp-cloud-crop'>
              {trackingEyes ? (
                <TrackingCloud />
              ) : (
                <img
                  src='/branding/skymoni-cloud-friend-transparent.png'
                  alt=''
                  width='220'
                  height='220'
                />
              )}
            </div>
            <span>skymoni</span>
            <p>{t('Your AI workspace')}</p>
          </div>
          <FloatingServiceCard
            className='hp-floating-card hp-floating-api'
            href='/pricing'
            target='_blank'
            rel='noopener noreferrer'
          >
            <div className='hp-floating-icon hp-blue'>
              <Boxes size={20} />
            </div>
            <div>
              <strong>{t('Model APIs')}</strong>
              <p>OpenAI · Claude · Gemini</p>
              <div className='hp-mini-models'>
                <OpenAI size={16} />
                <Anthropic size={16} />
                <Gemini.Color size={17} />
                <DeepSeek.Color size={17} />
              </div>
            </div>
            <ArrowRight
              size={13}
              className='hp-floating-arrow'
              aria-hidden='true'
            />
          </FloatingServiceCard>
          <FloatingServiceCard
            className='hp-floating-card hp-floating-mail'
            href={creatorEntry ? '/creators' : 'https://mail.skymoni.com'}
            target={creatorEntry ? undefined : '_blank'}
            rel={creatorEntry ? undefined : 'noopener noreferrer'}
          >
            <div className='hp-floating-icon hp-mint'>
              {creatorEntry ? <Palette size={19} /> : <Mail size={19} />}
            </div>
            <div>
              <strong>
                {t(creatorEntry ? 'Creator Space' : 'Your own email')}
              </strong>
              <p>{creatorEntry ? t('Share a project') : '@skymoni.com'}</p>
            </div>
            {creatorEntry && (
              <ArrowRight
                size={13}
                className='hp-floating-arrow'
                aria-hidden='true'
              />
            )}
          </FloatingServiceCard>
          <FloatingServiceCard
            className='hp-floating-card hp-floating-store'
            href='/shop'
          >
            <div className='hp-floating-icon hp-peach'>
              <ShoppingBag size={20} />
            </div>
            <div>
              <strong>{t('Digital store')}</strong>
              <p>Drip · Muse · {t('Email')}</p>
            </div>
            <ArrowRight
              size={13}
              className='hp-floating-arrow'
              aria-hidden='true'
            />
          </FloatingServiceCard>
        </div>
        <ConsoleEntry />
      </div>
      <div className='hp-container hp-capability-strip'>
        <span>
          <Boxes size={15} />
          {t('Model APIs')}
        </span>
        <span>
          <ShoppingBag size={15} />
          {t('Digital store')}
        </span>
        <span>
          <Mail size={15} />
          {t('Your own email')}
        </span>
        <span>
          <Archive size={15} />
          {t('Resource delivery')}
        </span>
        <a href='#services'>
          {t('See all services')}
          <ArrowRight size={14} />
        </a>
      </div>
    </section>
  )
}
