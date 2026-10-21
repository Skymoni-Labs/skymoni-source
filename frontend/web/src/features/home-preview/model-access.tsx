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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { HeroTerminalDemo } from '@/features/home/components/hero-terminal-demo'

import { PreviewIntro } from './hero'

export function ModelAccess() {
  const { t } = useTranslation()

  return (
    <section
      className='hp-api-demo-section'
      id='model-access'
      aria-labelledby='home-heading'
    >
      <div className='hp-api-demo-inner hp-container'>
        <AnimateInView className='min-w-0'>
          <PreviewIntro />
        </AnimateInView>
        <AnimateInView className='hp-api-demo-preview' delay={100}>
          <HeroTerminalDemo className='hp-api-demo-window' />
          <p className='hp-api-demo-caption'>
            {t(
              'Interactive example. Switch protocols to view requests and responses.'
            )}
          </p>
        </AnimateInView>
      </div>
    </section>
  )
}
