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
  ArrowRight,
  ArrowUpRight,
  Globe2,
  Mail,
  Monitor,
  Smartphone,
  TrendingUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { publicPreviewProducts } from '@/features/shop-public-preview/catalog'

export function Services() {
  const { t } = useTranslation()
  return (
    <section
      className='hp-discover hp-container'
      id='services'
      aria-labelledby='services-heading'
    >
      <AnimateInView className='hp-editorial-heading'>
        <div>
          <p className='hp-kicker'>EVERYDAY POSSIBILITIES</p>
          <h2 id='services-heading'>
            {t('More than models. More ways to create.')}
          </h2>
        </div>
        <p>
          {t(
            'From model access to everyday tools, discover the rest of your skymoni workspace.'
          )}
        </p>
      </AnimateInView>
      <div className='hp-feature-grid'>
        <AnimateInView className='flex min-w-0'>
          <a
            className='hp-feature hp-feature-browser flex-1'
            href='/software#drip'
          >
            <div className='hp-feature-copy'>
              <span className='hp-feature-label'>
                <Globe2 size={15} aria-hidden />
                {t('Drip Browser')}
              </span>
              <h3>{t('A browser with a space of its own.')}</h3>
              <p>
                {t(
                  'Manage subscriptions, switch proxy nodes and browse in a dedicated desktop workspace.'
                )}
              </p>
              <span className='hp-feature-link'>
                {t('Discover Drip')}
                <ArrowUpRight size={16} aria-hidden />
              </span>
            </div>
            <div className='hp-drip-showcase' aria-hidden>
              <div className='hp-browser-chrome'>
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <p>Drip Browser</p>
                <Monitor size={13} />
              </div>
              <img
                src={publicPreviewProducts[0].coverUrl}
                alt=''
                loading='lazy'
              />
            </div>
            <span className='hp-feature-tag'>WINDOWS · DRIP</span>
          </a>
        </AnimateInView>
        <AnimateInView className='flex min-w-0' delay={100}>
          <a
            className='hp-feature hp-feature-email flex-1'
            href='https://mail.skymoni.com'
            target='_blank'
            rel='noopener noreferrer'
          >
            <span className='hp-feature-label'>
              <Mail size={15} aria-hidden />
              skymoni Mail
            </span>
            <h3>{t('Your name. Your own inbox.')}</h3>
            <p>
              {t(
                'Choose your @skymoni.com address, and check your mail on the web or in the Android app.'
              )}
            </p>
            <div className='hp-mail-showcase' aria-hidden>
              <div className='hp-mail-envelope'>
                <Mail size={62} strokeWidth={1.1} />
              </div>
              <strong>
                name<span>@skymoni.com</span>
              </strong>
              <div className='hp-mail-devices'>
                <span>
                  <Globe2 size={13} />
                  WEB
                </span>
                <span>
                  <Smartphone size={13} />
                  ANDROID
                </span>
              </div>
            </div>
            <span className='hp-feature-link'>
              {t('Open your inbox')}
              <ArrowUpRight size={16} aria-hidden />
            </span>
          </a>
        </AnimateInView>
        <AnimateInView className='flex min-w-0'>
          <a
            className='hp-feature hp-feature-models flex-1'
            href='/pricing'
            target='_blank'
            rel='noopener noreferrer'
          >
            <div>
              <span className='hp-feature-label'>{t('Model catalog')}</span>
              <h3>{t('Find a model for your next idea.')}</h3>
              <p>
                {t(
                  'Compare model prices and supported API formats before connecting your tools.'
                )}
              </p>
              <span className='hp-feature-link'>
                {t('Open the model catalog')}
                <ArrowRight size={16} aria-hidden />
              </span>
            </div>
            <div className='hp-provider-stack' aria-hidden>
              <OpenAI size={29} />
              <Anthropic size={29} />
              <Gemini.Color size={30} />
              <DeepSeek.Color size={31} />
            </div>
          </a>
        </AnimateInView>
        <AnimateInView className='flex min-w-0' delay={100}>
          <a
            className='hp-feature hp-feature-trends flex-1'
            href='/rankings'
            target='_blank'
            rel='noopener noreferrer'
          >
            <div>
              <span className='hp-feature-label'>
                <TrendingUp size={15} aria-hidden />
                {t('Model rankings')}
              </span>
              <h3>{t('See what is being used.')}</h3>
              <p>
                {t('Explore model usage, provider share and trends over time.')}
              </p>
              <span className='hp-feature-link'>
                {t('Explore the rankings')}
                <ArrowRight size={16} aria-hidden />
              </span>
            </div>
            <div className='hp-trend-art' aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </a>
        </AnimateInView>
      </div>
    </section>
  )
}
