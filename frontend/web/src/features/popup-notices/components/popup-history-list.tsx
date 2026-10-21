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
import { useInfiniteQuery } from '@tanstack/react-query'
import { History, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { formatDateTimeObject } from '@/lib/time'

import { getPopupHistory, type PopupHistoryCursor } from '../api'

export function PopupHistoryList(props: {
  userId: number
  sid: string | null
  enabled: boolean
  onSelect: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const history = useInfiniteQuery({
    queryKey: ['popup-notices', 'history', props.userId, props.sid, 'list'],
    queryFn: ({ signal, pageParam }) =>
      getPopupHistory(props.userId, props.sid, signal, pageParam),
    initialPageParam: undefined as PopupHistoryCursor | undefined,
    getNextPageParam: (lastPage) => {
      const last = lastPage.at(-1)
      return lastPage.length === 20 && last
        ? { after_read_at: last.read_at, after_id: last.id }
        : undefined
    },
    enabled: props.enabled,
    staleTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  if (history.isPending) {
    return (
      <LoadingState
        className='min-h-48'
        message={t('Loading popup history...')}
      />
    )
  }
  if (history.isError && !history.data) {
    return (
      <ErrorState
        className='min-h-48 p-3'
        title={t('Unable to load popup history')}
        onRetry={() => {
          void history.refetch()
        }}
      />
    )
  }
  const items = history.data?.pages.flat() ?? []
  return (
    <div className='min-w-0 space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('Reopen popups you previously closed.')}
        </p>
        <Button
          size='icon-sm'
          variant='ghost'
          aria-label={t('Refresh popup history')}
          disabled={history.isFetching}
          onClick={() => {
            void history.refetch()
          }}
        >
          <RefreshCw className='size-3.5' />
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          className='min-h-48 p-3'
          icon={History}
          title={t('No popup history yet')}
          description={t('Popups appear here after you close them.')}
        />
      ) : (
        <ScrollArea className='h-[min(52dvh,28rem)] pr-3'>
          <div className='space-y-2'>
            {items.map((item) => (
              <Button
                key={item.id}
                variant='ghost'
                className='h-auto w-full min-w-0 items-start justify-start rounded-lg border p-3 text-left whitespace-normal'
                aria-label={t('Open popup {{title}}', { title: item.title })}
                onClick={() => props.onSelect(item.id)}
              >
                <History className='mt-0.5 size-4 shrink-0' />
                <span className='min-w-0 flex-1 space-y-1'>
                  <span className='block text-sm font-medium break-words'>
                    {item.title}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {t('Closed at {{time}}', {
                      time: formatDateTimeObject(new Date(item.read_at * 1000)),
                    })}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {t('Revision')} {formatNumber(item.revision, locale)}
                  </span>
                </span>
              </Button>
            ))}
            {history.isFetchNextPageError && (
              <p role='status' className='text-destructive text-xs'>
                {t('Unable to load more popup history')}
              </p>
            )}
            {history.hasNextPage && (
              <Button
                variant='outline'
                className='w-full'
                disabled={history.isFetching}
                onClick={() => {
                  void history.fetchNextPage()
                }}
              >
                {history.isFetchingNextPage ? t('Loading...') : t('Load more')}
              </Button>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
