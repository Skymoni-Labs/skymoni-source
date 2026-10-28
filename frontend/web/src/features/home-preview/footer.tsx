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

import '@/styles/home-services.css'

const footerGroups = [
  {
    title: 'Platform',
    links: [
      { title: 'Model catalog', href: '/pricing' },
      { title: 'Model rankings', href: '/rankings' },
      { title: 'Open the console', href: '/dashboard' },
    ],
  },
  {
    title: 'Tools and resources',
    links: [
      { title: 'Software Center', href: '/software' },
      { title: 'Drip Browser', href: '/software#drip' },
      { title: 'skymoni Mail', href: 'https://mail.skymoni.com' },
      { title: 'Digital store', href: '/shop' },
      { title: 'My warehouse', href: '/warehouse' },
    ],
  },
  {
    title: 'Developer resources',
    links: [
      { title: 'Setup guides', href: '/about' },
      { title: 'API Keys', href: '/keys' },
      { title: 'Playground', href: '/playground' },
      { title: 'Usage Logs', href: '/usage-logs/common' },
    ],
  },
  {
    title: 'Open-source licenses',
    links: [
      { title: 'License notices', href: '/open-source.html' },
      {
        title: 'Third-party notices',
        href: '/app-releases/THIRD_PARTY_NOTICES.txt',
      },
      { title: 'Get corresponding source', href: '/open-source.html#source' },
    ],
  },
] as const

export function HomeFooter() {
  const { t } = useTranslation()
  return (
    <footer className='hp-site-footer'>
      <AnimateInView className='hp-container hp-footer-main'>
        <div className='hp-footer-identity'>
          <strong>skymoni</strong>
          <p>
            {t('Models, tools and resources, connected.')}
            <br />
            {t('Make a little more possible, every day.')}
          </p>
        </div>
        {footerGroups.map((group) => (
          <nav key={group.title} aria-label={t(group.title)}>
            <strong>{t(group.title)}</strong>
            {group.links.map((link) => (
              <a key={link.title} href={link.href}>
                {t(link.title)}
              </a>
            ))}
          </nav>
        ))}
      </AnimateInView>
      <div className='hp-container hp-footer-bottom'>
        <span>© 2026 skymoni</span>
        <a href='/open-source.html' target='_blank' rel='noopener noreferrer'>
          New API · QuantumNous
        </a>
      </div>
    </footer>
  )
}
