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

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

interface FooterProps {
  logo?: string
  name?: string
  columns?: { title: string; links: { text: string; href: string }[] }[]
  copyright?: string
  className?: string
}

export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const { systemName, footerHtml } = useSystemConfig()
  const { status } = useStatus()
  return (
    <footer
      className={cn('border-border/40 border-t px-6 py-5', props.className)}
    >
      <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs'>
        <div className='text-muted-foreground'>
          {footerHtml ? (
            <div dangerouslySetInnerHTML={{ __html: footerHtml }} />
          ) : (
            <span>
              © {new Date().getFullYear()}{' '}
              {systemName || props.name || 'skymoni'} ·{' '}
              {props.copyright ?? t('One key, multiple AI services')}
            </span>
          )}
        </div>
        <nav
          aria-label={t('User resources')}
          className='text-muted-foreground flex flex-wrap items-center gap-4'
        >
          <a href='/about' className='hover:text-foreground'>
            {t('skymoni user guide')}
          </a>
          <a href='/jev' className='hover:text-foreground'>
            {t('Jev decision API')}
          </a>
          {status?.user_agreement_enabled && (
            <a href='/user-agreement'>{t('User Agreement')}</a>
          )}
          {status?.privacy_policy_enabled && (
            <a href='/privacy-policy'>{t('Privacy Policy')}</a>
          )}
        </nav>
      </div>
    </footer>
  )
}
