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
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'

import { AuthCloudCompanion } from './auth-cloud-companion'
import { AuthGlassRefraction } from './auth-glass-refraction'

import './brand-auth-layout.css'
import './auth-glass.css'

export function BrandAuthLayout({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'sign-in' | 'sign-up'
}) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const signingUp = variant === 'sign-up'
  const creatorContext = useRouterState({
    select: (state) =>
      (state.location.search as { redirect?: string }).redirect?.startsWith(
        '/creators'
      ) === true,
  })

  return (
    <div className={`sky-auth${signingUp ? ' sky-auth-signup' : ''}`}>
      <AuthGlassRefraction />
      <header className='sky-auth-header'>
        <Link
          to={creatorContext ? '/creators' : '/'}
          className='sky-auth-brand'
        >
          <img src='/skymoni-favicon.png' width='44' height='44' alt='' />
          <span>{creatorContext ? t('skymoni Community') : systemName}</span>
        </Link>
        <span className='sky-auth-header-note'>
          {t('A little cloud, endless possibilities.')}
        </span>
      </header>
      <main className='sky-auth-main'>
        <section
          className='sky-auth-story'
          aria-label={t('Welcome to skymoni')}
        >
          <span className='sky-auth-eyebrow'>
            ✦ {t('Your ideas, a little brighter')}
          </span>
          <h1>
            {t(
              signingUp
                ? 'Every great idea starts here.'
                : 'Welcome back to your little cloud.'
            )}
          </h1>
          <p>
            {t(
              creatorContext
                ? 'A home for your projects'
                : 'Connect to AI. Make room for your imagination.'
            )}
          </p>
          <AuthCloudCompanion />
        </section>
        <section className='sky-auth-card'>
          <img
            className='sky-auth-card-cloud'
            src='/skymoni-favicon.png'
            width='64'
            height='64'
            alt=''
          />
          {children}
        </section>
      </main>
    </div>
  )
}
