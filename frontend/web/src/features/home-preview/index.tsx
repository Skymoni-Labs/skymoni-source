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
import { ArrowRight, ChevronRight, LayoutDashboard } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { PublicHeader } from '@/components/layout/components/public-header'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { HomeSaleSpotlight } from '@/features/model-sales/home-spotlight'

import { AppDownload } from './app-download'
import { HomeFooter } from './footer'
import { GetStarted } from './get-started'
import { PreviewHeader } from './header'
import { PreviewHero } from './hero'
import { ModelAccess } from './model-access'
import { ModelMarquee } from './model-marquee'
import { Services } from './services'

import '@/styles/home-preview.css'

export function HomePreview(props: { preview?: boolean }) {
  const { t, i18n } = useTranslation()
  useEffect(() => {
    document.documentElement.lang =
      toIntlLocale(i18n.resolvedLanguage || i18n.language) || 'en'
  }, [i18n.language, i18n.resolvedLanguage])
  return (
    <>
      {props.preview === false ? <PublicHeader /> : <PreviewHeader />}
      <div className='hp-page'>
        <main>
          <PreviewHero />
          <HomeSaleSpotlight />
          <AppDownload />
          <ModelAccess />
          <AnimateInView>
            <ModelMarquee />
          </AnimateInView>
          <Services />
          <GetStarted />
          <AnimateInView>
            <section
              className='hp-final-invitation hp-container'
              aria-labelledby='ready-heading'
            >
              <div className='hp-invitation-copy'>
                <img
                  src='/branding/skymoni-cloud-friend-transparent.png'
                  alt=''
                  width='91'
                  height='91'
                />
                <div>
                  <h2 id='ready-heading'>{t('Your next idea starts here.')}</h2>
                  <p>
                    {t(
                      'One account connects your models, tools and digital resources.'
                    )}
                  </p>
                </div>
              </div>
              <Button
                className='group h-11 rounded-lg px-5 text-sm font-medium'
                render={
                  <a
                    href='/dashboard'
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <LayoutDashboard size={16} aria-hidden />
                {t('Open the console')}
                <ArrowRight size={16} aria-hidden />
              </Button>
            </section>
          </AnimateInView>
        </main>
        <HomeFooter />
        {props.preview !== false && (
          <aside className='hp-preview-label' aria-label={t('Local preview')}>
            <span />
            {t('Local preview')} · V2
            <a
              href='https://skymoni.com'
              target='_blank'
              rel='noopener noreferrer'
            >
              {t('View current homepage')}
              <ChevronRight size={13} />
            </a>
          </aside>
        )}
      </div>
    </>
  )
}
