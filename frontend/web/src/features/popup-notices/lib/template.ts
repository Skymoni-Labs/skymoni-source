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
import type { TFunction } from 'i18next'

import type { PopupFormValues } from './schema'

export function popupAnnouncementTemplate(
  t: TFunction
): Pick<PopupFormValues, 'title' | 'content' | 'format'> {
  return {
    title: t('Welcome to skymoni'),
    format: 'markdown',
    content: [
      `## ${t('Welcome to skymoni')}`,
      t('Here is a quick guide to getting started with skymoni.'),
      `### ${t('Explore the Model Square')}`,
      t(
        'Browse the Model Square to check available models and their current pricing before choosing a model.'
      ),
      `### ${t('Check your wallet')}`,
      t('Open Wallet to check your balance and available top-up options.'),
      `### ${t('Need help?')}`,
      t(
        'For help with models, requests, or billing, use the customer support entry on the site.'
      ),
      t(
        'After signing in, you can reopen previously closed popup announcements from the notification menu.'
      ),
    ].join('\n\n'),
  }
}
