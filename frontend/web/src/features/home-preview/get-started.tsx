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
import { ArrowRight, Boxes, KeyRound, ShoppingBag, Ticket } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'

const journeys = [
  {
    id: 'models',
    number: '01',
    title: 'Use model APIs',
    icon: Boxes,
    description:
      'Create a key, choose a model and connect the tools you already use.',
    href: '/keys',
    action: 'Create an API key',
  },
  {
    id: 'store',
    number: '02',
    title: 'Explore tools and resources',
    icon: ShoppingBag,
    description:
      'Browse products and packages freely. Sign in when you find what you need.',
    href: '/shop',
    action: 'Browse digital products',
  },
  {
    id: 'redeem',
    number: '03',
    title: 'Redeem a resource code',
    icon: Ticket,
    description:
      'Redeem your code in the wallet, then find the delivered resource in your warehouse.',
    href: '/wallet',
    action: 'Open wallet and redemption',
  },
] as const

export function GetStarted() {
  const { t } = useTranslation()
  return (
    <section
      className='hp-start hp-container'
      id='get-connected'
      aria-labelledby='get-started-heading'
    >
      <AnimateInView className='hp-editorial-heading'>
        <div>
          <p className='hp-kicker'>YOUR FIRST STEP</p>
          <h2 id='get-started-heading'>
            {t('Where would you like to start?')}
          </h2>
        </div>
        <a
          className='hp-text-link'
          href='/about'
          target='_blank'
          rel='noopener noreferrer'
        >
          {t('View the setup guide')}
          <ArrowRight size={15} aria-hidden />
        </a>
      </AnimateInView>
      <div className='hp-start-grid'>
        {journeys.map((journey, index) => (
          <AnimateInView
            key={journey.id}
            className='flex min-w-0'
            delay={index * 150}
          >
            <article className='hp-start-card w-full'>
              <div className='hp-start-top'>
                <journey.icon size={24} strokeWidth={1.5} aria-hidden />
                <span>{journey.number}</span>
              </div>
              <h3>{t(journey.title)}</h3>
              <p>{t(journey.description)}</p>
              <a className='hp-text-link' href={journey.href}>
                {t(journey.action)}
                <ArrowRight size={15} aria-hidden />
              </a>
            </article>
          </AnimateInView>
        ))}
      </div>
      <AnimateInView className='hp-connect-bar'>
        <KeyRound size={16} aria-hidden />
        <span>{t('Your API base URL')}</span>
        <code>https://skymoni.com/v1</code>
        <CopyButton
          value='https://skymoni.com/v1'
          size='sm'
          aria-label={t('Copy the base URL')}
        />
      </AnimateInView>
    </section>
  )
}
