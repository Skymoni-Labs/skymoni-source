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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import { getPopupHistoryDetail } from '../api'
import { PopupNoticeDialog } from './popup-notice-dialog'

export function PopupHistoryDialog(props: {
  id: number
  userId: number
  sid: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const detail = useQuery({
    queryKey: [
      'popup-notices',
      'history',
      props.userId,
      props.sid,
      'detail',
      props.id,
    ],
    queryFn: ({ signal }) =>
      getPopupHistoryDetail(props.id, props.userId, props.sid, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  if (detail.data) {
    return (
      <PopupNoticeDialog history notice={detail.data} onClose={props.onClose} />
    )
  }
  return (
    <Dialog
      open
      title={t('Popup history')}
      contentClassName='sm:max-w-2xl'
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={<Button onClick={props.onClose}>{t('Close')}</Button>}
    >
      {detail.isError ? (
        <ErrorState
          className='min-h-48'
          title={t('Unable to open this popup')}
          onRetry={() => {
            void detail.refetch()
          }}
        />
      ) : (
        <LoadingState className='min-h-48' message={t('Loading popup...')} />
      )}
    </Dialog>
  )
}
