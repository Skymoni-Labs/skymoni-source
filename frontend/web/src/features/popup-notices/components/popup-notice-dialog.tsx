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

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { PopupBenefitAction } from '@/features/benefits/components/popup-action'

import type { PopupNotice } from '../types'
import { PopupContent } from './popup-content'

export function PopupNoticeDialog(props: {
  notice: Pick<
    PopupNotice,
    'title' | 'content' | 'format' | 'benefit_code_id'
  > & { id?: number; notice_id?: number; revision?: number }
  onClose: () => void
  preview?: boolean
  history?: boolean
}) {
  const { t } = useTranslation()
  let description: string | undefined
  if (props.preview) {
    description = t(
      'Only visible to you. This preview does not publish the popup.'
    )
  } else if (props.history) {
    description = t(
      'Previously closed popup. Viewing it again does not change its display frequency.'
    )
  }
  let closeLabel = t('Got it')
  if (props.preview) closeLabel = t('Close preview')
  else if (props.history) closeLabel = t('Close')
  return (
    <Dialog
      open
      title={props.notice.title || t('Popup preview')}
      description={description}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      contentClassName='sm:max-w-2xl'
      bodyClassName='min-w-0'
      footer={
        <>
          {!!props.notice.benefit_code_id && (
            <PopupBenefitAction
              id={props.notice.notice_id ?? props.notice.id}
              revision={props.notice.revision}
              preview={props.preview}
              history={props.history}
            />
          )}
          <Button onClick={props.onClose}>{closeLabel}</Button>
        </>
      }
    >
      <div data-popup-notice={props.preview || props.history ? undefined : ''}>
        <PopupContent
          content={props.notice.content}
          format={props.notice.format}
        />
      </div>
    </Dialog>
  )
}
